export const SAMPLE_SOURCE_PROPERTY_ID = "ChIJ13u-9GIHZIgRJ5ZNOzLXuzs";
export const LEGACY_SAMPLE_PROPERTY_ID = "community:548";
export const SAMPLE_SOURCE_PROPERTY_NAME = "1540 Place Apartments";

export const SAMPLE_SOURCE_PROPERTY_IDS = [
  SAMPLE_SOURCE_PROPERTY_ID,
  LEGACY_SAMPLE_PROPERTY_ID,
] as const;

// Curated, analyzed examples. Keep this list explicit so new sessions never
// become visible as samples merely because of their property.
export const SAMPLE_SESSION_IDS = [
  "717f4772-ec00-4676-bcf4-1eaf924c3786", // Laura x Amulya - 8 exact moments
  "772c294c-130e-45b6-866a-5e374d7b9d29", // Laura x Amulya - long transcript
  "34a29aea-1810-4ec9-97b8-af3bd95fd8c8", // Vic Village - 392 transcript turns
  "2e47d28a-acf1-4590-a75a-8260c895e40a", // The George
  "7e9e24de-b723-4a52-a363-4ad2bee2e015", // Six11
] as const;

export const SAMPLE_SESSION_SET = new Set<string>(SAMPLE_SESSION_IDS);

export function isSampleSourceProperty(propertyId: string | null | undefined) {
  return SAMPLE_SOURCE_PROPERTY_IDS.some((samplePropertyId) => samplePropertyId === propertyId);
}
