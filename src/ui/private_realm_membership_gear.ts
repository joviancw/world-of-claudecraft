// Whether the realm advertises membership adaptive-gear claims (account bank button).

let claimsEnabled = true;

export function membershipGearClaimsAdvertised(): boolean {
  return claimsEnabled;
}

/** Returns true when claims are disabled on a private realm. */
export async function syncMembershipGearClaimsFromStatus(
  status: () => Promise<{
    private_realm?: boolean;
    private_realm_membership_gear?: boolean;
  }>,
): Promise<boolean> {
  try {
    const data = await status();
    if (data.private_realm !== true) {
      claimsEnabled = true;
      return false;
    }
    claimsEnabled = data.private_realm_membership_gear === true;
    return !claimsEnabled;
  } catch {
    return false;
  }
}