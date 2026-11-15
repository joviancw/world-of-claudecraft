// FIFO queue for custom-award reveal overlays with bounded depth and dedupe.

import type { CustomAwardRevealPayload } from './custom_award_reveal_view';
import { CUSTOM_AWARD_REVEAL_DEDUPE_MS } from './custom_award_reveal_view';

export const CUSTOM_AWARD_REVEAL_QUEUE_LIMIT = 4;

export type CustomAwardRevealEnqueueOutcome = 'show' | 'queued' | 'dropped' | 'deduped';

export class CustomAwardRevealQueue {
  private readonly waiting: CustomAwardRevealPayload[] = [];
  private live = false;
  private readonly recent = new Map<string, number>();

  get depth(): number {
    return this.waiting.length;
  }

  get isLive(): boolean {
    return this.live;
  }

  enqueue(payload: CustomAwardRevealPayload, now: number): CustomAwardRevealEnqueueOutcome {
    const last = this.recent.get(payload.dedupeKey);
    if (last !== undefined && now - last < CUSTOM_AWARD_REVEAL_DEDUPE_MS) return 'deduped';
    this.recent.set(payload.dedupeKey, now);
    for (const [key, at] of this.recent) {
      if (now - at > CUSTOM_AWARD_REVEAL_DEDUPE_MS * 2) this.recent.delete(key);
    }
    if (this.live) {
      if (this.waiting.length >= CUSTOM_AWARD_REVEAL_QUEUE_LIMIT) return 'dropped';
      this.waiting.push(payload);
      return 'queued';
    }
    this.live = true;
    return 'show';
  }

  advance(): CustomAwardRevealPayload | null {
    const next = this.waiting.shift();
    if (next) return next;
    this.live = false;
    return null;
  }

  clear(): void {
    this.waiting.length = 0;
    this.live = false;
  }
}
