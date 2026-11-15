// Plays the custom-award reveal overlay: queue, sound, and five-second lifetime.

import { audio } from '../../../game/audio';
import { CustomAwardRevealQueue } from './custom_award_reveal_queue';
import {
  buildCustomAwardRevealRoot,
  CUSTOM_AWARD_REVEAL_GAP_MS,
  CUSTOM_AWARD_REVEAL_MS,
  type CustomAwardRevealPayload,
  paintCustomAwardRevealCard,
} from './custom_award_reveal_view';

export interface CustomAwardRevealHost {
  mountParent(): HTMLElement | null;
  reducedMotion(): boolean;
}

export class CustomAwardRevealPainter {
  private root: HTMLElement | null = null;
  private readonly queue = new CustomAwardRevealQueue();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly host: CustomAwardRevealHost;

  constructor(host: CustomAwardRevealHost) {
    this.host = host;
  }

  enqueue(
    payload: Omit<CustomAwardRevealPayload, 'motion' | 'dedupeKey'> & { dedupeKey?: string },
  ): void {
    const full: CustomAwardRevealPayload = {
      ...payload,
      motion: !this.host.reducedMotion(),
      dedupeKey: payload.dedupeKey ?? `${payload.recipient}\0${payload.title}\0${payload.giver}`,
    };
    const outcome = this.queue.enqueue(full, performance.now());
    if (outcome === 'show') this.show(full);
  }

  previewRecipient(
    sample: Omit<CustomAwardRevealPayload, 'motion' | 'playSound' | 'dedupeKey' | 'isRecipient'>,
  ): void {
    this.enqueue({
      ...sample,
      isRecipient: true,
      playSound: true,
      dedupeKey: `preview:${performance.now()}`,
    });
  }

  clear(): void {
    this.queue.clear();
    this.clearTimers();
    if (this.root) {
      this.root.classList.remove('custom-award-reveal--visible');
      this.root.setAttribute('aria-hidden', 'true');
      this.root.replaceChildren();
    }
  }

  private ensureRoot(): HTMLElement {
    if (this.root?.isConnected) return this.root;
    const parent = this.host.mountParent();
    if (!parent) throw new Error('custom award reveal mount missing');
    const root = buildCustomAwardRevealRoot(parent.ownerDocument);
    parent.appendChild(root);
    this.root = root;
    return root;
  }

  private show(payload: CustomAwardRevealPayload): void {
    this.clearTimers();
    const root = this.ensureRoot();
    paintCustomAwardRevealCard(root, payload);
    root.setAttribute('aria-hidden', 'false');
    // reflow so the enter animation retriggers on every dequeue
    void root.offsetWidth;
    root.classList.add('custom-award-reveal--visible');
    if (payload.playSound) audio.achievement();
    const dwell = payload.motion ? CUSTOM_AWARD_REVEAL_MS : Math.min(3200, CUSTOM_AWARD_REVEAL_MS);
    this.hideTimer = setTimeout(() => {
      root.classList.remove('custom-award-reveal--visible');
      root.setAttribute('aria-hidden', 'true');
      this.gapTimer = setTimeout(() => {
        const next = this.queue.advance();
        if (next) this.show(next);
        else root.replaceChildren();
      }, CUSTOM_AWARD_REVEAL_GAP_MS);
    }, dwell);
  }

  private clearTimers(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }
}
