import { NextResponse } from "next/server";

import { createSupabaseAnonClient } from "@/lib/admin-auth";
import { getGoogleBusiness, normalizeBusinessIdentity } from "@/lib/google-places";
import { completeRegistration, registrationSessionResponse } from "@/lib/registration";
import { getSupabaseServiceClient } from "@/lib/supabase";

type SignupBody = {
  email?: string;
  password?: string;
  fullName?: string;
  mode?: "join" | "create";
  placeId?: string;
  communityId?: string | null;
  companyName?: string | null;
};

type ExistingCommunity = {
  id: string;
  name: string;
  company_id: string;
  gmb_id: string | null;
  alias: string | null;
  portal_enabled: boolean;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as SignupBody;
  const email = body.email?.trim().toLowerCase() ?? "";
  const fullName = body.fullName?.trim() ?? "";
  if (
    !email ||
    !body.password ||
    body.password.length < 8 ||
    !fullName ||
    !body.placeId ||
    (body.mode !== "join" && body.mode !== "create")
  ) {
    return NextResponse.json(
      { error: "Name, email, an 8-character password, business, and signup type are required." },
      { status: 400 }
    );
  }

  try {
    const business = await getGoogleBusiness(body.placeId);
    const supabase = getSupabaseServiceClient();
    const { data: exactMatch, error: existingError } = await supabase
      .from("communities")
      .select("id,name,company_id,gmb_id,alias,portal_enabled")
      .eq("gmb_id", business.placeId)
      .maybeSingle<ExistingCommunity>();
    if (existingError) throw new Error(existingError.message);

    let existing: ExistingCommunity | null = exactMatch;
    let matchedLegacyCommunity = false;
    if (!existing && body.communityId) {
      const { data: selected, error: selectedError } = await supabase
        .from("communities")
        .select("id,name,company_id,gmb_id,alias,portal_enabled")
        .eq("id", body.communityId)
        .maybeSingle<ExistingCommunity>();
      if (selectedError) throw new Error(selectedError.message);
      const identity = normalizeBusinessIdentity(business.name);
      if (
        selected?.portal_enabled &&
        !selected.gmb_id &&
        (
          normalizeBusinessIdentity(selected.alias) === identity ||
          normalizeBusinessIdentity(selected.name) === identity
        )
      ) {
        existing = { ...selected, gmb_id: business.placeId };
        matchedLegacyCommunity = true;
      }
    }

    if (body.mode === "join" && (!existing || existing.id !== body.communityId)) {
      return NextResponse.json(
        { error: "The selected team no longer matches this business." },
        { status: 409 }
      );
    }
    if (body.mode === "create") {
      if (!existing) {
        const { data: legacyCommunities, error: legacyError } = await supabase
          .from("communities")
          .select("id,name,alias")
          .is("gmb_id", null)
          .eq("portal_enabled", true);
        if (legacyError) throw new Error(legacyError.message);
        const identity = normalizeBusinessIdentity(business.name);
        const legacyRows = (legacyCommunities ?? []) as unknown as Array<{
          id: string;
          name: string;
          alias: string | null;
        }>;
        const legacyMatch = legacyRows.find((community) =>
          normalizeBusinessIdentity(community.alias) === identity ||
          normalizeBusinessIdentity(community.name) === identity
        );
        if (legacyMatch) existing = {
          ...legacyMatch,
          company_id: "",
          gmb_id: business.placeId,
          portal_enabled: true,
        };
      }
    }
    if (body.mode === "create" && existing) {
      return NextResponse.json(
        { error: "A team already exists for this business. Join that team instead." },
        { status: 409 }
      );
    }
    if (body.mode === "join" && matchedLegacyCommunity) {
      const { error: linkError } = await supabase
        .from("communities")
        .update({ gmb_id: business.placeId } as never)
        .eq("id", existing!.id)
        .is("gmb_id", null);
      if (linkError) throw new Error(linkError.message);
    }

    await supabase
      .from("registration_requests")
      .update({ status: "expired", updated_at: new Date().toISOString() } as never)
      .eq("status", "pending")
      .eq("email", email);

    const { data: signupRequest, error: requestError } = await supabase
      .from("registration_requests")
      .insert({
        email,
        full_name: fullName,
        mode: body.mode,
        community_id: body.mode === "join" ? existing!.id : null,
        company_name: body.mode === "create"
          ? body.companyName?.trim() || business.name
          : null,
        gmb_place_id: business.placeId,
        business_name: business.name,
        formatted_address: business.formattedAddress,
        phone: business.phone,
        website: business.website,
        google_maps_url: business.googleMapsUrl,
      } as never)
      .select("id")
      .single<{ id: string }>();
    if (requestError || !signupRequest) {
      throw new Error(requestError?.message ?? "Could not start registration.");
    }

    const auth = createSupabaseAnonClient();
    const { data, error } = await auth.auth.signUp({
      email,
      password: body.password,
      options: {
        data: {
          full_name: fullName,
          registration_request_id: signupRequest.id,
        },
      },
    });
    if (error) throw new Error(error.message);
    if (!data.user || data.user.identities?.length === 0) {
      return NextResponse.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 }
      );
    }

    if (data.session) {
      const workspace = await completeRegistration(signupRequest.id, data.user);
      return registrationSessionResponse(workspace, data.session);
    }

    return NextResponse.json({
      requestId: signupRequest.id,
      email,
      verified: false,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not start registration." },
      { status: 500 }
    );
  }
}
