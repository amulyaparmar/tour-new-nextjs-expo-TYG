import "server-only";

import { decryptSecret, encryptSecret } from "./crypto";
import { getSupabaseServiceClient } from "./supabase";

export type EntrataIntegrationStatus = "disconnected" | "testing" | "connected" | "error";

export type EntrataIntegration = {
  provider: "entrata";
  status: EntrataIntegrationStatus;
  domain: string | null;
  propertyId: string | null;
  scopes: string[];
  stats: {
    guestCardsSynced?: number;
    tourScoresPushed?: number;
    followUpNotesPushed?: number;
    propertiesSynced?: number;
    unitsSynced?: number;
  };
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type IntegrationRow = {
  provider: "entrata";
  status: EntrataIntegrationStatus;
  domain: string | null;
  property_id: string | null;
  encrypted_credentials: unknown;
  scopes: string[] | null;
  stats: EntrataIntegration["stats"] | null;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type EntrataCredentials = {
  domain: string;
  apiKey: string;
  propertyId?: string | null;
};

const DEFAULT_SCOPES = [
  "getProperties",
  "getLeads",
  "getLeadEvents",
  "getPropertyUnits",
  "leaseNotes",
];

export async function getEntrataIntegration(): Promise<EntrataIntegration> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("admin_integrations")
      .select("provider,status,domain,property_id,encrypted_credentials,scopes,stats,last_tested_at,last_synced_at,last_error")
      .eq("provider", "entrata")
      .maybeSingle<IntegrationRow>();

    if (error) throw new Error(error.message);
    if (!data) return disconnectedIntegration();
    return mapIntegrationRow(data);
  } catch {
    return disconnectedIntegration();
  }
}

export async function disconnectEntrataIntegration(): Promise<EntrataIntegration> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_integrations")
    .upsert({
      provider: "entrata",
      status: "disconnected",
      encrypted_credentials: null,
      last_error: null,
      updated_at: now,
    } as never, { onConflict: "provider" })
    .select("provider,status,domain,property_id,encrypted_credentials,scopes,stats,last_tested_at,last_synced_at,last_error")
    .single<IntegrationRow>();

  if (error || !data) throw new Error(error?.message ?? "Failed to disconnect Entrata.");
  return mapIntegrationRow(data);
}

export async function connectEntrataIntegration(
  credentials: EntrataCredentials,
  stats?: EntrataIntegration["stats"]
): Promise<EntrataIntegration> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_integrations")
    .upsert({
      provider: "entrata",
      status: "connected",
      domain: normalizeEntrataDomain(credentials.domain),
      property_id: credentials.propertyId?.trim() || null,
      encrypted_credentials: encryptSecret(credentials.apiKey),
      scopes: DEFAULT_SCOPES,
      stats: stats ?? {},
      last_tested_at: now,
      last_synced_at: stats ? now : null,
      last_error: null,
      updated_at: now,
    } as never, { onConflict: "provider" })
    .select("provider,status,domain,property_id,encrypted_credentials,scopes,stats,last_tested_at,last_synced_at,last_error")
    .single<IntegrationRow>();

  if (error || !data) throw new Error(error?.message ?? "Failed to save Entrata integration.");
  return mapIntegrationRow(data);
}

export async function saveEntrataError(
  credentials: Partial<EntrataCredentials>,
  message: string
): Promise<EntrataIntegration> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_integrations")
    .upsert({
      provider: "entrata",
      status: "error",
      domain: credentials.domain ? normalizeEntrataDomain(credentials.domain) : null,
      property_id: credentials.propertyId?.trim() || null,
      last_tested_at: now,
      last_error: message,
      updated_at: now,
    } as never, { onConflict: "provider" })
    .select("provider,status,domain,property_id,encrypted_credentials,scopes,stats,last_tested_at,last_synced_at,last_error")
    .single<IntegrationRow>();

  if (error || !data) throw new Error(error?.message ?? "Failed to save Entrata error.");
  return mapIntegrationRow(data);
}

export async function loadEntrataCredentials(): Promise<EntrataCredentials | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_integrations")
    .select("domain,property_id,encrypted_credentials,status")
    .eq("provider", "entrata")
    .maybeSingle<Pick<IntegrationRow, "domain" | "property_id" | "encrypted_credentials" | "status">>();

  if (error) throw new Error(error.message);
  if (!data?.domain || !data.encrypted_credentials || data.status !== "connected") return null;

  return {
    domain: data.domain,
    propertyId: data.property_id,
    apiKey: decryptSecret(data.encrypted_credentials),
  };
}

export async function updateEntrataSyncStats(stats: EntrataIntegration["stats"]) {
  const now = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("admin_integrations")
    .update({
      stats,
      last_synced_at: now,
      last_error: null,
      updated_at: now,
    } as never)
    .eq("provider", "entrata")
    .select("provider,status,domain,property_id,encrypted_credentials,scopes,stats,last_tested_at,last_synced_at,last_error")
    .single<IntegrationRow>();

  if (error || !data) throw new Error(error?.message ?? "Failed to update Entrata sync stats.");
  return mapIntegrationRow(data);
}

export async function testEntrataConnection(credentials: EntrataCredentials) {
  const domain = normalizeEntrataDomain(credentials.domain);
  const client = new EntrataClient({ ...credentials, domain });
  const properties = await client.call("getProperties", {
    propertyIds: credentials.propertyId ? [credentials.propertyId] : undefined,
  });

  return {
    ok: true,
    domain,
    propertyId: credentials.propertyId?.trim() || null,
    propertiesFound: countEntrataRecords(properties),
    raw: properties,
  };
}

export async function syncEntrataReferenceData(credentials: EntrataCredentials) {
  const client = new EntrataClient(credentials);
  const [properties, leads, units] = await Promise.allSettled([
    client.call("getProperties", {
      propertyIds: credentials.propertyId ? [credentials.propertyId] : undefined,
    }),
    client.call("getLeads", {
      propertyId: credentials.propertyId || undefined,
    }),
    client.call("getPropertyUnits", {
      propertyId: credentials.propertyId || undefined,
    }),
  ]);

  return {
    propertiesSynced: properties.status === "fulfilled" ? countEntrataRecords(properties.value) : 0,
    guestCardsSynced: leads.status === "fulfilled" ? countEntrataRecords(leads.value) : 0,
    unitsSynced: units.status === "fulfilled" ? countEntrataRecords(units.value) : 0,
    errors: [properties, leads, units]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)),
  };
}

export class EntrataClient {
  private domain: string;
  private apiKey: string;

  constructor(credentials: EntrataCredentials) {
    this.domain = normalizeEntrataDomain(credentials.domain);
    this.apiKey = credentials.apiKey;
  }

  async call(method: string, params: Record<string, unknown> = {}) {
    const url = `https://${this.domain}/api/v1/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        auth: { type: "basic" },
        method: { name: method, params },
      }),
    });

    const text = await response.text();
    const parsed = parseEntrataResponse(text);

    if (!response.ok) {
      throw new Error(`Entrata ${method} failed with ${response.status}: ${summarizeEntrataPayload(parsed)}`);
    }

    if (isEntrataErrorPayload(parsed)) {
      throw new Error(`Entrata ${method} error: ${summarizeEntrataPayload(parsed)}`);
    }

    return parsed;
  }
}

export function normalizeEntrataDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^([^.]+)$/, "$1.entrata.com")
    .toLowerCase();
}

function parseEntrataResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isEntrataErrorPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const raw = JSON.stringify(payload).toLowerCase();
  return raw.includes('"error"') || raw.includes('"errors"') || raw.includes("invalid api") || raw.includes("unauthorized");
}

function summarizeEntrataPayload(payload: unknown) {
  if (typeof payload === "string") return payload.slice(0, 240);
  return JSON.stringify(payload).slice(0, 240);
}

function countEntrataRecords(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;

  let count = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      count = Math.max(count, value.length);
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(payload);
  return count;
}

function disconnectedIntegration(): EntrataIntegration {
  return {
    provider: "entrata",
    status: "disconnected",
    domain: null,
    propertyId: null,
    scopes: [],
    stats: {},
    lastTestedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

function mapIntegrationRow(row: IntegrationRow): EntrataIntegration {
  return {
    provider: "entrata",
    status: row.status,
    domain: row.domain,
    propertyId: row.property_id,
    scopes: row.scopes ?? [],
    stats: row.stats ?? {},
    lastTestedAt: row.last_tested_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  };
}
