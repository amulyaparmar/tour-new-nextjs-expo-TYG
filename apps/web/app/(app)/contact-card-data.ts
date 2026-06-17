/**
 * Back-compat shim. The source of truth for rep/property cards now lives in
 * `@/lib/reps`. This file preserves the original single-rep exports (derived from
 * the "alex" card) so existing in-app consumers — ContactCardPanel, profile,
 * SmartSessionForm — keep working unchanged. Migrate those to `getRepCard` later.
 */
import {
  buildVCard,
  getRepCard,
  offlineContactQrUrl,
  tourRequestQrUrl as repTourRequestQrUrl,
  vCardDownloadUrl
} from "@/lib/reps";

const card = getRepCard("alex")!;
const { rep, property } = card;

export const contactCard = {
  name: rep.name,
  initials: rep.initials,
  title: rep.title,
  company: rep.company,
  phoneDisplay: rep.phoneDisplay,
  phoneValue: rep.phoneValue,
  email: rep.email,
  websiteDisplay: rep.websiteDisplay ?? "",
  website: rep.website ?? "",
  localPath: `/p/${rep.slug}`
};

export const propertyTour = {
  name: property.name,
  mediaUrl: property.mediaUrl
};

export const contactVcard = buildVCard(rep);
export const encodedContactCard = encodeURIComponent(contactVcard);
export const encodedLeadUrl = encodeURIComponent(contactCard.website);
export const contactCardDownloadUrl = vCardDownloadUrl(rep);
export const offlineContactCardQrUrl = offlineContactQrUrl(rep);
export const tourRequestQrUrl = repTourRequestQrUrl(rep);
export const contactCardShareUrl = `mailto:?subject=${encodeURIComponent(`${contactCard.name} contact card`)}&body=${encodeURIComponent(
  `${contactCard.name}\n${contactCard.title}, ${contactCard.company}\n${contactCard.phoneDisplay}\n${contactCard.email}\n${contactCard.website}`
)}`;
