// Parse the English chat lines for player-awarded achievements
// (src/sim/custom_award_messages.ts). Shared by log_event_route.ts (cues) and
// hud.ts (celebration copy).

export {
  customAwardAnnouncementMessage,
  customAwardSentMessage,
} from '../sim/custom_award_messages';

export interface CustomAwardAnnouncementParts {
  recipient: string;
  title: string;
  giver: string;
}

export interface CustomAwardSentParts {
  title: string;
  recipient: string;
}

const ANNOUNCEMENT =
  /^ACHIEVEMENT UNLOCKED! (.+?) has earned "([^"]+)"! Awarded by (.+)\.$/;

const SENT = /^You awarded "([^"]+)" to (.+)\.$/;

export function parseCustomAwardAnnouncement(text: string): CustomAwardAnnouncementParts | null {
  const match = ANNOUNCEMENT.exec(text);
  if (!match) return null;
  return { recipient: match[1], title: match[2], giver: match[3] };
}

export function parseCustomAwardSent(text: string): CustomAwardSentParts | null {
  const match = SENT.exec(text);
  if (!match) return null;
  return { title: match[1], recipient: match[2] };
}