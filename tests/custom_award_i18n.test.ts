import { describe, expect, it } from 'vitest';
import {
  CUSTOM_AWARD_NOTICES,
  customAwardAnnouncement,
  customAwardDailyCap,
  customAwardDescriptionTooLong,
  customAwardSent,
  customAwardTitleTooLong,
} from '../server/custom_award_command';
import { logEventCue } from '../src/ui/log_event_route';
import { localizeCustomAwardText, localizeSystemText } from '../src/ui/system_text_i18n';

describe('custom award client text', () => {
  it('every server line has a matcher arm (English round trip is exact)', () => {
    const lines = [
      ...Object.values(CUSTOM_AWARD_NOTICES),
      customAwardAnnouncement('Bob', 'Fish Whisperer', 'Ann'),
      customAwardSent('Fish Whisperer', 'Bob'),
      customAwardTitleTooLong(40),
      customAwardDescriptionTooLong(160),
      customAwardDailyCap(10),
    ];
    for (const line of lines) {
      expect(localizeCustomAwardText(line), line).toBe(line);
      expect(localizeSystemText(line)).toBe(line);
    }
    expect(localizeCustomAwardText('Bob joins the party.')).toBeNull();
  });

  it('a title that looks like another system line still reads as the award', () => {
    const line = customAwardAnnouncement('Bob', 'Message of the day: hi', 'Ann');
    expect(localizeSystemText(line)).toBe(line);
  });

  it('the announcement fires the achievement sound and banner', () => {
    expect(logEventCue(customAwardAnnouncement('Bob', 'Hero', 'Ann'))).toEqual({
      sound: 'achievement',
      banner: 'hud.system.customAwardBanner',
    });
    expect(logEventCue('Bob joins the party.')).toEqual({ sound: null, banner: null });
  });
});
