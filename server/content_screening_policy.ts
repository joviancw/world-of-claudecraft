// Stock realms screen account/character/guild names (obscenity + operator banlist)
// and run the chat filter tiers. Private realms (PRIVATE_REALM=1) disable all of
// that so friends can name and chat without automated blocks or asterisk masking.

type Env = Readonly<Record<string, string | undefined>>;

export function contentScreeningEnabled(env: Env = process.env): boolean {
  return env.PRIVATE_REALM !== '1';
}