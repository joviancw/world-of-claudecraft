import { describe, expect, it } from 'vitest';
import {
  parseCustomAwardAnnouncement,
  parseCustomAwardSent,
} from '../src/ui/custom_award_log_feedback';
import { logEventCue } from '../src/ui/log_event_route';
import { localizeCustomAwardText } from '../src/ui/system_text_i18n';

describe('custom award log feedback', () => {
  it('parses realm-wide announcements with spaced character names', () => {
    const text =
      'ACHIEVEMENT UNLOCKED! Sir Jovi has earned "Fish Whisperer"! Awarded by Ann Example.';
    expect(parseCustomAwardAnnouncement(text)).toEqual({
      recipient: 'Sir Jovi',
      title: 'Fish Whisperer',
      giver: 'Ann Example',
    });
    expect(logEventCue(text)).toEqual({
      sound: 'achievement',
      banner: 'hud.system.customAwardBanner',
    });
    expect(localizeCustomAwardText(text)).toContain('Fish Whisperer');
  });

  it('parses the giver confirmation line', () => {
    const text = 'You awarded "Fish Whisperer" to Sir Jovi.';
    expect(parseCustomAwardSent(text)).toEqual({
      title: 'Fish Whisperer',
      recipient: 'Sir Jovi',
    });
    expect(localizeCustomAwardText(text)).toContain('Sir Jovi');
  });
});