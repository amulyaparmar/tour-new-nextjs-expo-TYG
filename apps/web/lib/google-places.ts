import "server-only";

export type GoogleBusiness = {
  placeId: string;
  name: string;
  formattedAddress: string;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
};

export function normalizeBusinessIdentity(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tourApiBaseUrl() {
  return (process.env.TOUR_API_BASE_URL || "https://tour.new").replace(/\/$/, "");
}

function normalizePlace(place: Record<string, unknown>): GoogleBusiness {
  const displayName = place.displayName as { text?: string } | undefined;
  return {
    placeId: String(place.id ?? ""),
    name: String(displayName?.text ?? ""),
    formattedAddress: String(place.formattedAddress ?? ""),
    phone: place.nationalPhoneNumber ? String(place.nationalPhoneNumber) : null,
    website: place.websiteUri ? String(place.websiteUri) : null,
    googleMapsUrl: place.googleMapsUri ? String(place.googleMapsUri) : null,
  };
}

export async function searchGoogleBusinesses(query: string): Promise<GoogleBusiness[]> {
  const response = await fetch(
    `${tourApiBaseUrl()}/api/gmb/search?query=${encodeURIComponent(query)}&extra=false`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(`Google business search failed (${response.status}).`);
  const payload = await response.json() as {
    data?: Record<string, unknown>;
    places?: Array<Record<string, unknown>>;
  };
  const places = payload.places?.length
    ? payload.places
    : payload.data
      ? [payload.data]
      : [];
  return places.map(normalizePlace).filter((place) => place.placeId && place.name);
}

export async function getGoogleBusiness(placeId: string): Promise<GoogleBusiness> {
  const response = await fetch(
    `${tourApiBaseUrl()}/api/gmb/place-details?place_id=${encodeURIComponent(placeId)}`,
    { cache: "no-store" }
  );
  if (!response.ok) throw new Error(`Google business lookup failed (${response.status}).`);
  const payload = await response.json() as {
    result?: {
      place_id?: string;
      name?: string;
      formatted_address?: string;
      formatted_phone_number?: string;
      website?: string;
      google_maps_url?: string;
    };
  };
  const result = payload.result;
  if (!result?.place_id || !result.name) throw new Error("Google business was not found.");
  return {
    placeId: result.place_id,
    name: result.name,
    formattedAddress: result.formatted_address ?? "",
    phone: result.formatted_phone_number || null,
    website: result.website || null,
    googleMapsUrl: result.google_maps_url || null,
  };
}
