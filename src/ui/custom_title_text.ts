// Client-side text for player-awarded titles (`custom:<awardId>`, the private
// realm's custom achievements). They are database rows, not content, so no
// catalog can resolve them: the identity wire carries the text beside the id,
// the self character's award list fills its own, and deedTitleText reads it
// back here. Player-authored text: callers render it as text, never markup.

const texts = new Map<string, string>();

export function rememberCustomTitleText(id: string, text: string): void {
  if (text !== '') texts.set(id, text);
}

export function customTitleText(id: string): string {
  return texts.get(id) ?? '';
}
