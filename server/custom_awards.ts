// Player-awarded achievements on a private realm (PRIVATE_REALM=1): the /award
// chat command, its server-side rules, and the realm-wide announcement.
//
// Trust: the giver is ALWAYS the session's own character (session.characterId
// and session.name, set at world auth); nothing the client sends names the
// giver. The recipient is resolved by name against this realm's characters,
// and an award to any character on the giver's own account is refused, so a
// player cannot mint titles for themselves through an alt.
//
// Awards are cosmetic only: no stats, XP, Renown or items, and nothing here
// reaches the deterministic sim. With the private realm off the command is not
// claimed at all, so a stock realm's chat behaves exactly as before.

import type { Pool } from 'pg';
import { onCustomAwardChanged } from './custom_award_changes';
import {
  CUSTOM_AWARD_NOTICES,
  type CustomAwardCommand,
  customAwardAnnouncement,
  customAwardDailyCap,
  customAwardSent,
  draftCustomAward,
  parseCustomAwardCommand,
} from './custom_award_command';
import { CustomAwardTitles, type CustomTitleSim } from './custom_award_titles';
import { type CustomAwardsStore, customAwardsStore } from './custom_awards_db';
import { logger } from './http/logger';
import { privateRealmRules } from './private_realm_config';
import { REALM } from './realm';

const ANNOUNCE_COLOR = '#ffd100';
const NOTICE_COLOR = '#ffd100';
const ERROR_COLOR = '#ff6060';

export interface CustomAwardSession {
  accountId: number;
  characterId: number;
  name: string;
}

export interface CustomAwardLane<S> {
  consumeCommandLane(session: S, nowSec: number): boolean;
}

export interface CustomAwardBroadcast<S> {
  sessions(): Iterable<S>;
  sendRaw(session: S, payload: string): void;
}

/** A recipient changed what they own (a new award). */
export type CustomAwardListener = (recipientCharacterId: number) => void;

function logPayload(text: string, color: string): string {
  return JSON.stringify({ t: 'events', list: [{ type: 'log', text, color }] });
}

export class CustomAwards<S extends CustomAwardSession> {
  // One award in flight per account, and one per second per session: the
  // command does two database round trips and a realm-wide fan-out.
  private readonly inFlight = new Set<number>();
  private readonly nextAllowed = new WeakMap<object, number>();
  private readonly listeners: CustomAwardListener[] = [];

  constructor(
    private readonly lane: CustomAwardLane<S>,
    private readonly broadcast: CustomAwardBroadcast<S>,
    readonly store: CustomAwardsStore,
    private readonly rules = () => privateRealmRules()?.achievements ?? null,
  ) {}

  onAwarded(listener: CustomAwardListener): void {
    this.listeners.push(listener);
  }

  private titles: CustomAwardTitles | null = null;

  /** Turn on the live title sync (server/custom_award_titles.ts). The boot
   *  wiring calls this once with the game's sim; until then every sync is a
   *  no-op, so a bare test GameServer needs no database. */
  bindSim(sim: () => CustomTitleSim): void {
    if (this.titles) return;
    this.titles = new CustomAwardTitles(
      this.store,
      () => this.rules()?.customAwardsEnabled === true,
      sim,
    );
    this.onAwarded((characterId) => this.syncTitles(characterId));
    onCustomAwardChanged((characterId) => this.syncTitles(characterId));
  }

  /** Refresh one character's wearable titles if it is online. Fire and forget. */
  syncTitles(characterId: number): void {
    void this.titles?.sync(characterId).catch((err) => {
      logger.error({ err, characterId }, 'custom title sync failed');
    });
  }

  /** Claim a chat line as /award. False when it is not one (or the realm is
   *  not private), so the chat dispatch carries on. */
  handleChat(session: S, text: string, nowSec: number): boolean {
    const rules = this.rules();
    if (!rules?.customAwardsEnabled) return false;
    const cmd = parseCustomAwardCommand(text);
    if (!cmd) return false;
    if (!this.lane.consumeCommandLane(session, nowSec)) return true;
    if (nowSec < (this.nextAllowed.get(session) ?? -Infinity)) return true;
    if (this.inFlight.has(session.accountId)) return true;
    this.nextAllowed.set(session, nowSec + 1);
    this.inFlight.add(session.accountId);
    void this.run(session, cmd)
      .catch((err) => {
        logger.error({ err }, 'custom award failed');
        this.notice(session, CUSTOM_AWARD_NOTICES.failed, ERROR_COLOR);
      })
      .finally(() => this.inFlight.delete(session.accountId));
    return true;
  }

  async run(session: S, cmd: CustomAwardCommand): Promise<void> {
    const rules = this.rules();
    if (!rules) return;
    if (cmd.kind === 'usage') return this.notice(session, CUSTOM_AWARD_NOTICES.usage, ERROR_COLOR);
    const draft = draftCustomAward(cmd, session.name, rules);
    if (!draft.ok) return this.notice(session, draft.notice, ERROR_COLOR);
    const recipient = await this.store.findRecipient(draft.target);
    if (!recipient) return this.notice(session, CUSTOM_AWARD_NOTICES.notFound, ERROR_COLOR);
    if (recipient.characterId === session.characterId || recipient.accountId === session.accountId)
      return this.notice(session, CUSTOM_AWARD_NOTICES.self, ERROR_COLOR);
    const result = await this.store.insert({
      giverCharacterId: session.characterId,
      giverName: session.name,
      recipientCharacterId: recipient.characterId,
      title: draft.title,
      titleKey: draft.titleKey,
      description: draft.description,
      dailyCap: rules.dailyAwardCap,
    });
    if (result.kind === 'capped')
      return this.notice(session, customAwardDailyCap(rules.dailyAwardCap), ERROR_COLOR);
    if (result.kind === 'duplicate')
      return this.notice(session, CUSTOM_AWARD_NOTICES.duplicate, ERROR_COLOR);
    logger.info(
      {
        awardId: result.id,
        giverCharacterId: session.characterId,
        recipientCharacterId: recipient.characterId,
      },
      'custom award granted',
    );
    this.notice(session, customAwardSent(draft.title, recipient.name), NOTICE_COLOR);
    this.announce(
      recipient,
      customAwardAnnouncement(recipient.name, draft.title, session.name),
      rules.globalAnnouncements,
    );
    for (const listener of this.listeners) listener(recipient.characterId);
  }

  // Serialize-once fan-out: the same payload string goes to every session.
  // Without global announcements only the recipient (if online) hears it.
  private announce(recipient: { characterId: number }, line: string, global: boolean): void {
    const payload = logPayload(line, ANNOUNCE_COLOR);
    for (const s of this.broadcast.sessions()) {
      if (global || s.characterId === recipient.characterId) this.broadcast.sendRaw(s, payload);
    }
  }

  private notice(session: S, text: string, color: string): void {
    this.broadcast.sendRaw(session, logPayload(text, color));
  }
}

/** GameServer's one-line wiring: the /flair host already carries the command
 *  lane and the MOTD host the session fan-out. */
export function createCustomAwards<S extends CustomAwardSession>(
  lane: CustomAwardLane<S>,
  broadcast: CustomAwardBroadcast<S>,
  getPool: () => Pool,
): CustomAwards<S> {
  return new CustomAwards(lane, broadcast, customAwardsStore(getPool, REALM));
}
