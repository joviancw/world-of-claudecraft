// Stable English chat lines for player-awarded achievements (server fan-out and
// client parsers). Host-agnostic: no DOM, no I/O.

export function customAwardSentMessage(title: string, recipient: string): string {
  return `You awarded "${title}" to ${recipient}.`;
}

export function customAwardAnnouncementMessage(
  recipient: string,
  title: string,
  giver: string,
): string {
  return `ACHIEVEMENT UNLOCKED! ${recipient} has earned "${title}"! Awarded by ${giver}.`;
}
