import { NextRequest, NextResponse } from "next/server";

function getGooglePlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchTerm = searchParams.get("query") || searchParams.get("name");
    const includeExtra = searchParams.get("extra") !== "false";
    const apiKey = getGooglePlacesApiKey();

    if (!searchTerm) {
      return NextResponse.json({ error: "Either query or name parameter is required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });
    }

    let fieldMask = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.types,places.primaryType,places.googleMapsUri";

    if (includeExtra) {
      fieldMask += ",places.reviews,places.photos,places.editorialSummary,places.addressComponents";
    }

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify({ textQuery: searchTerm })
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google Places API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const place = data?.places?.[0] || null;

    if (!place) {
      return NextResponse.json({ error: "No places found matching that query" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: place });
  } catch (error) {
    console.error("Error in GMB search route:", error);
    return NextResponse.json({ error: "Failed to search GMB data" }, { status: 500 });
  }
}
