// "A recipient's awards changed" (hidden, shown, or rejected through REST), so
// the live title sync (server/custom_award_titles.ts) can refresh an online
// recipient without the route layer knowing about the game server.

type Listener = (recipientCharacterId: number) => void;

const listeners = new Set<Listener>();

export function onCustomAwardChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function customAwardChanged(recipientCharacterId: number): void {
  for (const listener of listeners) listener(recipientCharacterId);
}
