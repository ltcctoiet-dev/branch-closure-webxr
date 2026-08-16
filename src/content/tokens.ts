/**
 * Filling in the blanks.
 *
 * The script writes personalised lines as "Hello [Customer Name], welcome" and
 * "We understand that your local branch, [Branch Name], is closing."
 *
 * Those square-bracket tokens stay exactly as written in scenes.json — the copy
 * matches the approved document word for word — and get filled in at the moment
 * a line is drawn.
 *
 * SYNTHETIC DATA ONLY. Values come from public/data/customer.json, an invented
 * customer. Nothing here touches a real record.
 *
 * NEW IN PART 2: customerProfile(), so the summary screen can read the same
 * values rather than keeping its own copy.
 */

export type CustomerProfile = {
  customerName: string;
  branchName: string;
  branchDistance: string;
  hubName: string;
  hubAddress: string;
  hubDistance: string;
  hubTravelTime: string;
  hubOpeningTimes: string;
  communityBankerDays: string;
};

let profile: CustomerProfile | null = null;

export async function loadCustomer(url = "/data/customer.json"): Promise<CustomerProfile> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not open ${url} (error ${response.status}).`);
  }
  profile = (await response.json()) as CustomerProfile;
  return profile;
}

export function customerProfile(): CustomerProfile | null {
  return profile;
}

/**
 * Swaps [Customer Name] and friends for the real values.
 * Unknown tokens are left alone rather than blanked, so a typo shows up as
 * "[Hub Nmae]" rather than silently producing an empty gap.
 */
export function resolveTokens(text: string): string {
  if (!profile) return text;

  const map: Record<string, string> = {
    "[Customer Name]": profile.customerName,
    "[Branch Name]": profile.branchName,
    "[Branch Distance]": profile.branchDistance,
    "[Hub Name]": profile.hubName,
    "[Hub Address]": profile.hubAddress,
    "[Hub Distance]": profile.hubDistance,
    "[Hub Travel Time]": profile.hubTravelTime,
    "[Hub Opening Times]": profile.hubOpeningTimes,
    "[Community Banker Days]": profile.communityBankerDays,
  };

  return Object.entries(map).reduce(
    (result, [token, value]) => result.split(token).join(value),
    text,
  );
}
