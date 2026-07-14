import "server-only";

import { toPublicAlias } from "@tour/shared";

import { DEFAULT_QUESTIONS, type RepCard } from "./reps";
import { getSupabaseServiceClient } from "./supabase";

type PropertyRepRow = {
  id: string;
  name: string | null;
  alias: string | null;
  website: string | null;
  thumbnail_url: string | null;
  property_manager: string | null;
  metadata: unknown;
};

export async function getPropertyRepCard(
  propertyIdentity: string,
  memberIdentity: string
): Promise<RepCard | null> {
  const supabase = getSupabaseServiceClient();
  const propertyKey = propertyIdentity.trim().replace(/^@/, "").toLowerCase();
  const memberKey = memberIdentity.trim().replace(/^@/, "").toLowerCase();
  if (!propertyKey || !memberKey) return null;

  let property: PropertyRepRow | null = null;
  const { data: byId, error: idError } = await supabase
    .from("propertiesTYG")
    .select("id,name,alias,website,thumbnail_url,property_manager,metadata")
    .eq("id", propertyIdentity)
    .maybeSingle<PropertyRepRow>();
  if (idError) throw new Error(idError.message);
  property = byId ?? null;
  if (!property) {
    const { data: byAlias, error: aliasError } = await supabase
      .from("propertiesTYG")
      .select("id,name,alias,website,thumbnail_url,property_manager,metadata")
      .eq("alias", propertyKey)
      .maybeSingle<PropertyRepRow>();
    if (aliasError) throw new Error(aliasError.message);
    property = byAlias ?? null;
  }
  if (!property) {
    // Match defaults derived from the live property name before an alias is saved.
    const { data: teamProperties, error: teamError } = await supabase
      .from("propertiesTYG")
      .select("id,name,alias,website,thumbnail_url,property_manager,metadata")
      .not("metadata->property_team", "is", null)
      .order("id", { ascending: true })
      .limit(500);
    if (teamError) throw new Error(teamError.message);
    property = ((teamProperties ?? []) as PropertyRepRow[]).find((row) =>
      toPublicAlias(row.alias) === propertyKey || toPublicAlias(row.name) === propertyKey
    ) ?? null;
  }
  if (!property || !isRecord(property.metadata) || !Array.isArray(property.metadata.property_team)) return null;

  const member = property.metadata.property_team.find((candidate) => {
    if (!isRecord(candidate)) return false;
    const email = cleanString(candidate.email).toLowerCase();
    const emailKey = email.split("@")[0] ?? "";
    const nameKey = toPublicAlias(cleanString(candidate.name) || null);
    return [candidate.alias, candidate.id, candidate.user_id, candidate.userId]
      .map((value) => cleanString(value).replace(/^@/, "").toLowerCase())
      .concat(emailKey, nameKey)
      .filter(Boolean)
      .includes(memberKey);
  });
  if (!isRecord(member)) return null;

  const email = cleanString(member.email);
  const name = cleanString(member.name)
    || email.split("@")[0]
    || "Property team member";
  const phoneValue = normalizePhone(cleanString(member.phone));
  const title = cleanString(member.title) || cleanString(member.role) || "Property Team";
  const slug = toPublicAlias(cleanString(member.alias) || null)
    || toPublicAlias(name)
    || toPublicAlias(email.split("@")[0])
    || cleanString(member.id ?? member.user_id ?? member.userId)
    || memberKey;
  const propertyName = cleanString(property.name) || "Property";
  return {
    rep: {
      slug,
      name,
      initials: initialsForName(name),
      title,
      company: cleanString(property.property_manager) || propertyName,
      email,
      phoneValue,
      phoneDisplay: formatPhone(phoneValue),
      website: property.website || undefined,
      websiteDisplay: property.website ? property.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : undefined,
    },
    property: {
      id: property.id,
      name: propertyName,
      mediaUrl: property.thumbnail_url || "",
      mediaKind: property.thumbnail_url ? "image" : undefined,
    },
    questions: DEFAULT_QUESTIONS,
  };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function initialsForName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "T";
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  return phone.startsWith("+") ? `+${digits}` : digits;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone || "Phone not provided";
}
