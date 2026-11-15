// The /award chat command of a private realm (server/custom_awards.ts runs
// it): any player names another character and mints a cosmetic achievement
// for them.
//
//   /award <name> "<title>" <description>
//
// This module is pure: the parse, the text cleaning and every rule that needs
// no database (lengths, the word filter, the same-name self check). The
// English lines here are stable source text; the client re-localizes each one
// in src/ui/system_text_i18n.ts, splicing the player-authored parts verbatim.
//
// The parser lives here rather than as `case` labels in game.ts's dispatch
// because tests/command_schema.test.ts scrapes those labels as wire commands
// (the reason server/flair_command.ts exists too).

import {
  customAwardAnnouncementMessage,
  customAwardSentMessage,
} from '../src/sim/custom_award_messages';
import { cleanRealmMotdText } from './realm_motd';

export type CustomAwardCommand =
  | { kind: 'award'; target: string; title: string; description: string }
  | { kind: 'usage' };

export const CUSTOM_AWARD_NOTICES = {
  usage: 'Usage: /award <name> "<title>" <description>',
  self: 'You cannot award an achievement to yourself.',
  offensive: 'That achievement contains a word that is not allowed.',
  notFound: 'No character by that name was found on this realm.',
  duplicate: 'That character already has an achievement with that title.',
  failed: 'The achievement could not be saved. Try again later.',
} as const;

export function customAwardTitleTooLong(max: number): string {
  return `Achievement titles are limited to ${max} characters.`;
}

export function customAwardDescriptionTooLong(max: number): string {
  return `Achievement descriptions are limited to ${max} characters.`;
}

export function customAwardDailyCap(cap: number): string {
  return `You can award at most ${cap} achievements per day.`;
}

export const customAwardSent = customAwardSentMessage;
export const customAwardAnnouncement = customAwardAnnouncementMessage;

/** Parse a chat line as /award, or null when it is not one. */
export function parseCustomAwardCommand(text: string): CustomAwardCommand | null {
  const match = /^\/award(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const args = /^(\S+)\s+"([^"]*)"(?:\s+([\s\S]*))?$/.exec((match[1] ?? '').trim());
  if (!args) return { kind: 'usage' };
  return { kind: 'award', target: args[1], title: args[2], description: args[3] ?? '' };
}

/** One line of player text, safe to splice into a chat line: control and
 *  invisible format characters folded (the MOTD rule), and the chat item-link
 *  token brackets collapsed so a title can never mint a clickable link. */
export function cleanCustomAwardText(raw: string): string {
  return cleanRealmMotdText(raw)
    .replace(/\[{2,}/g, '[')
    .replace(/\]{2,}/g, ']');
}

export interface CustomAwardLimits {
  maxTitleLength: number;
  maxDescriptionLength: number;
}

export type CustomAwardDraft =
  | { ok: true; target: string; title: string; titleKey: string; description: string }
  | { ok: false; notice: string };

/** Every database-free rule. The giver's name is the server's session name,
 *  never anything the client sent. */
export function draftCustomAward(
  cmd: Extract<CustomAwardCommand, { kind: 'award' }>,
  giverName: string,
  limits: CustomAwardLimits,
): CustomAwardDraft {
  const title = cleanCustomAwardText(cmd.title);
  const description = cleanCustomAwardText(cmd.description);
  if (!title) return { ok: false, notice: CUSTOM_AWARD_NOTICES.usage };
  if (title.length > limits.maxTitleLength)
    return { ok: false, notice: customAwardTitleTooLong(limits.maxTitleLength) };
  if (description.length > limits.maxDescriptionLength)
    return { ok: false, notice: customAwardDescriptionTooLong(limits.maxDescriptionLength) };
  if (cmd.target.toLowerCase() === giverName.toLowerCase())
    return { ok: false, notice: CUSTOM_AWARD_NOTICES.self };
  return { ok: true, target: cmd.target, title, titleKey: title.toLowerCase(), description };
}
