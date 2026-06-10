import { NextRequest, NextResponse } from "next/server";

function getGooglePlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";
}

function toPlacesFieldMask(fields: string) {
  const requested = new Set(fields.split(",").map((field) => field.trim()));
  const masks = new Set([
    "id",
    "displayName",
    "formattedAddress",
    "nationalPhoneNumber",
    "rating",
    "userRatingCount",
    "websiteUri",
    "googleMapsUri",
    "types",
    "primaryType",
    "editorialSummary"
  ]);

  if (requested.has("photos")) masks.add("photos");
  if (requested.has("reviews")) masks.add("reviews");
  if (requested.has("addressComponents")) masks.add("addressComponents");

  return Array.from(masks).join(",");
}

function sortReviews(reviews: any[], reviewSort: string) {
  if (reviewSort !== "positive" && reviewSort !== "best") return reviews;

  return [...reviews].sort((a, b) => {
    const ratingDelta = (b.rating || 0) - (a.rating || 0);
    if (ratingDelta !== 0) return ratingDelta;

    const aTextLength = a.text?.text?.length || 0;
    const bTextLength = b.text?.text?.length || 0;
    return bTextLength - aTextLength;
  });
}

function normalizePlace(place: any, reviewSort: string) {
  const sortedReviews = Array.isArray(place.reviews) ? sortReviews(place.reviews, reviewSort) : [];

  return {
    place_id: place.id,
    name: place.displayName?.text || "",
    rating: place.rating || 0,
    user_ratings_total: place.userRatingCount || 0,
    formatted_address: place.formattedAddress || "",
    formatted_phone_number: place.nationalPhoneNumber || "",
    website: place.websiteUri || "",
    google_maps_url: place.googleMapsUri || "",
    types: place.types || [],
    primary_type: place.primaryType || "",
    editorial_summary: place.editorialSummary?.text || "",
    photos: Array.isArray(place.photos)
      ? place.photos.map((photo: any) => ({
          photo_reference: photo.name,
          height: photo.heightPx,
          width: photo.widthPx,
          html_attributions: photo.authorAttributions || []
        }))
      : [],
    reviews: sortedReviews.map((review: any) => ({
      author_name: review.authorAttribution?.displayName || "Anonymous",
      rating: review.rating || 5,
      text: review.text?.text || "",
      relative_time_description: review.relativePublishTimeDescription || "",
      time: review.publishTime ? Math.floor(new Date(review.publishTime).getTime() / 1000) : undefined
    }))
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("place_id");
    const fields = searchParams.get("fields") || "place_id,name,rating,user_ratings_total,formatted_address,formatted_phone_number,website,photos,reviews";
    const reviewSort = searchParams.get("review_sort") || searchParams.get("reviews_sort") || "default";
    const apiKey = getGooglePlacesApiKey();

    if (!placeId) {
      return NextResponse.json({ error: "Place ID is required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });
    }

    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": toPlacesFieldMask(fields)
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Google Places API error: ${response.status}` },
        { status: response.status }
      );
    }

    const place = await response.json();

    if (!place?.id) {
      return NextResponse.json({ success: false, error: "No place found", status: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      result: normalizePlace(place, reviewSort),
      status: "OK"
    });
  } catch (error: any) {
    console.error("Error in place-details API:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch place details", details: error?.message },
      { status: 500 }
    );
  }
}
