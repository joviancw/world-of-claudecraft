/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import {
  buildCustomAwardRevealRoot,
  customAwardRevealDedupeKey,
  paintCustomAwardRevealCard,
} from '../src/ui/hud/custom_awards/custom_award_reveal_view';

describe('custom award reveal view', () => {
  it('builds a recipient plate with title, names, and optional description', () => {
    const root = buildCustomAwardRevealRoot(document);
    paintCustomAwardRevealCard(root, {
      recipient: 'Sir Jovi',
      title: 'Fish Whisperer',
      giver: 'Ann Example',
      description: 'A quiet marsh legend.',
      isRecipient: true,
      motion: true,
      playSound: true,
      dedupeKey: customAwardRevealDedupeKey({
        recipient: 'Sir Jovi',
        title: 'Fish Whisperer',
        giver: 'Ann Example',
      }),
    });
    expect(root.querySelector('.custom-award-reveal__title')?.textContent).toBe('Fish Whisperer');
    expect(root.querySelector('.custom-award-reveal__description')?.textContent).toBe(
      'A quiet marsh legend.',
    );
    expect(root.querySelectorAll('.custom-award-reveal__spark').length).toBe(8);
    expect(root.classList.contains('custom-award-reveal--recipient')).toBe(true);
  });
});