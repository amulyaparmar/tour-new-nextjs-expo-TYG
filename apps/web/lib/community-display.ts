type CommunityDisplayInput = {
  name: string;
  companyName?: string | null;
  companySlug?: string | null;
};

const DISPLAY_PREFIX_BY_COMPANY_SLUG: Record<string, string> = {
  "legacy-7f7f041174fe86fc50797833": "PeakMade",
  peakmade: "PeakMade",
};

const DISPLAY_PREFIX_BY_COMPANY_NAME: Record<string, string> = {
  peakmade: "PeakMade",
  "peakmade real estate": "PeakMade",
};

export function formatCommunityDisplayName(community: CommunityDisplayInput) {
  const name = community.name.trim();
  const prefix = communityDisplayPrefix(community);
  if (!prefix || startsWithDisplayPrefix(name, prefix)) return name;
  return `${prefix} - ${name}`;
}

export function compareCommunityDisplayName(
  left: CommunityDisplayInput,
  right: CommunityDisplayInput
) {
  return formatCommunityDisplayName(left).localeCompare(
    formatCommunityDisplayName(right),
    undefined,
    { sensitivity: "base" }
  );
}

function communityDisplayPrefix(community: CommunityDisplayInput) {
  const slug = community.companySlug?.trim().toLowerCase();
  if (slug && DISPLAY_PREFIX_BY_COMPANY_SLUG[slug]) {
    return DISPLAY_PREFIX_BY_COMPANY_SLUG[slug];
  }

  const companyName = community.companyName?.trim().toLowerCase();
  if (companyName && DISPLAY_PREFIX_BY_COMPANY_NAME[companyName]) {
    return DISPLAY_PREFIX_BY_COMPANY_NAME[companyName];
  }

  return null;
}

function startsWithDisplayPrefix(name: string, prefix: string) {
  return name.toLowerCase().startsWith(`${prefix.toLowerCase()} - `);
}
