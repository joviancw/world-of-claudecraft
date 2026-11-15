import { describe, expect, it } from 'vitest';
import { CustomAwardRevealQueue } from '../src/ui/hud/custom_awards/custom_award_reveal_queue';
import { CUSTOM_AWARD_REVEAL_DEDUPE_MS } from '../src/ui/hud/custom_awards/custom_award_reveal_view';

function payload(key: string) {
  return {
    recipient: 'A',
    title: 'T',
    giver: 'G',
    isRecipient: false,
    motion: true,
    playSound: true,
    dedupeKey: key,
  };
}

describe('CustomAwardRevealQueue', () => {
  it('queues reveals while one is live and drops when over capacity', () => {
    const q = new CustomAwardRevealQueue();
    expect(q.enqueue(payload('a'), 0)).toBe('show');
    expect(q.enqueue(payload('b'), 1)).toBe('queued');
    expect(q.advance()).toEqual(payload('b'));
    for (let i = 0; i < 6; i++) {
      q.enqueue(payload(`c${i}`), 10 + i);
    }
    expect(q.enqueue(payload('overflow'), 99)).toBe('dropped');
  });

  it('dedupes identical keys inside the retry window', () => {
    const q = new CustomAwardRevealQueue();
    expect(q.enqueue(payload('same'), 100)).toBe('show');
    q.advance();
    expect(q.enqueue(payload('same'), 100 + CUSTOM_AWARD_REVEAL_DEDUPE_MS - 1)).toBe('deduped');
    expect(q.enqueue(payload('same'), 100 + CUSTOM_AWARD_REVEAL_DEDUPE_MS + 1)).toBe('show');
  });
});