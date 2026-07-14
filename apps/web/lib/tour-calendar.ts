import "server-only";

import { createHash } from "node:crypto";

import type { AdminWorkspace } from "./admin-auth";
import { buildSessionTourTitle } from "@tour/shared";
import { getSupabaseServiceClient } from "./supabase";

const TOUR_API_BASE_URL = (process.env.TOUR_API_BASE_URL ?? "https://tour.new").replace(/\/$/, "");
const TOUR_EVENT_TYPE_IDS = "17,449";

type TourEntrataConfig = {
  username: string;
  propertyId: string;
};

type CalendarIntegrationRow = {
  provider: string;
  status: string;
  source: string;
  external_property_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  stats: Record<string, unknown> | null;
  auto_sync_enabled?: boolean | null;
};

export type StoredCalendarEvent = {
  id: string;
  session_id: string | null;
  external_event_id: string;
  external_application_id: string | null;
  event_type: "in_person" | "virtual" | "other";
  status: string;
  appointment_date: string;
  time_from: string | null;
  time_to: string | null;
  prospect_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  notes: string | null;
  synced_at: string;
};

type EntrataEvent = Record<string, unknown> & {
  eventId?: string | number;
  typeId?: string | number;
  type?: string;
  date?: string;
  dateTime?: string;
  appointmentDate?: string;
  timeFrom?: string;
  timeTo?: string;
  eventResult?: string;
  eventReason?: string;
  Comments?: string;
};

type NormalizedCalendarEvent = {
  company_id: string;
  property_id: string;
  provider: "entrata";
  external_event_id: string;
  external_application_id: string | null;
  event_type: "in_person" | "virtual" | "other";
  status: string;
  appointment_date: string;
  starts_at: string | null;
  ends_at: string | null;
  time_from: string | null;
  time_to: string | null;
  prospect_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  notes: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
  updated_at: string;
};

export async function getCommunityCalendarIntegration(workspace: AdminWorkspace) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("calendar_integrations")
    .select("provider,status,source,external_property_id,last_synced_at,last_error,stats,auto_sync_enabled")
    .eq("property_id", workspace.community.id)
    .eq("provider", "entrata")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as unknown as CalendarIntegrationRow | null;
  return {
    provider: "entrata" as const,
    status: row?.status ?? "disconnected",
    domain: "tour.new",
    propertyId: row?.external_property_id ?? workspace.community.entrataPropertyId,
    source: row?.source ?? "tour_new",
    scopes: ["availability", "scheduled_tours", "lead_events"],
    stats: row?.stats ?? {},
    autoSyncEnabled: Boolean(row?.auto_sync_enabled),
    lastTestedAt: null,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ?? null,
  };
}

export async function setCommunityEntrataAutoSync(
  workspace: AdminWorkspace,
  autoSyncEnabled: boolean,
) {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("calendar_integrations")
    .select("property_id")
    .eq("property_id", workspace.community.id)
    .eq("provider", "entrata")
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("calendar_integrations")
      .update({
        auto_sync_enabled: autoSyncEnabled,
        updated_at: now,
      } as never)
      .eq("property_id", workspace.community.id)
      .eq("provider", "entrata");
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("calendar_integrations").insert({
      property_id: workspace.community.id,
      company_id: workspace.organization.id,
      provider: "entrata",
      source: "tour_new",
      status: "connected",
      auto_sync_enabled: autoSyncEnabled,
      updated_at: now,
    } as never);
    if (error) throw new Error(error.message);
  }

  return getCommunityCalendarIntegration(workspace);
}

/** Communities with Entrata connected and auto-sync enabled (for cron). */
export async function listAutoSyncEntrataIntegrations(): Promise<Array<{
  propertyId: string;
  companyId: string;
  externalPropertyId: string | null;
}>> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("calendar_integrations")
    .select("property_id,company_id,external_property_id,status,auto_sync_enabled")
    .eq("provider", "entrata")
    .eq("auto_sync_enabled", true)
    .in("status", ["connected", "error", "syncing"]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{
    property_id: string;
    company_id: string;
    external_property_id: string | null;
  }>).map((row) => ({
    propertyId: row.property_id,
    companyId: row.company_id,
    externalPropertyId: row.external_property_id,
  }));
}

export async function syncCommunityCalendar(
  workspace: AdminWorkspace,
  options: { fromDate?: string; toDate?: string } = {}
) {
  const today = startOfUtcDay(new Date());
  const fromDate = parseIsoDate(options.fromDate) ?? formatIsoDate(today);
  const toDate = parseIsoDate(options.toDate) ?? formatIsoDate(addDays(today, 120));
  const createdFrom = formatEntrataDate(addDays(parseDate(fromDate), -180));
  const createdTo = formatEntrataDate(parseDate(toDate));
  const config = await loadTourEntrataConfig(workspace);
  const supabase = getSupabaseServiceClient();

  await supabase
    .from("calendar_integrations")
    .update({ status: "syncing", last_error: null, updated_at: new Date().toISOString() } as never)
    .eq("property_id", workspace.community.id)
    .eq("provider", "entrata");

  try {
    const payload = await callTourEntrata("getLeadEvents", {
      creds: { username: config.username },
      property_id: config.propertyId,
      eventTypeIds: TOUR_EVENT_TYPE_IDS,
      eventDateFrom: createdFrom,
      eventDateTo: createdTo,
    });
    const normalized = normalizeLeadEvents(payload, workspace, fromDate, toDate);
    await enrichCalendarEventsWithPeople(
      normalized,
      config,
      createdFrom,
      formatEntrataDate(today)
    );
    if (normalized.length > 0) {
      const { error: upsertError } = await supabase
        .from("calendar_events")
        .upsert(normalized as never, {
          onConflict: "property_id,provider,external_event_id",
        });
      if (upsertError) throw new Error(upsertError.message);
      await syncEntrataSessions(normalized, workspace);
    }

    const now = new Date().toISOString();
    const stats = {
      scheduledTours: normalized.filter((event) => !isCancelled(event.status)).length,
      cancelledTours: normalized.filter((event) => isCancelled(event.status)).length,
      eventsSynced: normalized.length,
      prospectsEnriched: normalized.filter((event) => event.prospect_name).length,
      rangeFrom: fromDate,
      rangeTo: toDate,
    };
    const { error: integrationError } = await supabase
      .from("calendar_integrations")
      .update({
        status: "connected",
        external_property_id: config.propertyId,
        last_synced_at: now,
        last_error: null,
        stats,
        updated_at: now,
      } as never)
      .eq("property_id", workspace.community.id)
      .eq("provider", "entrata");
    if (integrationError) throw new Error(integrationError.message);

    return { ...stats, events: normalized.map(toPublicCalendarEvent) };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Calendar sync failed.";
    await supabase
      .from("calendar_integrations")
      .update({ status: "error", last_error: message, updated_at: new Date().toISOString() } as never)
      .eq("property_id", workspace.community.id)
      .eq("provider", "entrata");
    throw caught;
  }
}

export async function listCommunityCalendarEvents(
  workspace: AdminWorkspace,
  options: { fromDate?: string; toDate?: string } = {}
) {
  const today = startOfUtcDay(new Date());
  const fromDate = parseIsoDate(options.fromDate) ?? formatIsoDate(today);
  const toDate = parseIsoDate(options.toDate) ?? formatIsoDate(addDays(today, 120));
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id,session_id,external_event_id,external_application_id,event_type,status,appointment_date,time_from,time_to,prospect_name,prospect_email,prospect_phone,notes,synced_at")
    .eq("property_id", workspace.community.id)
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate)
    .order("appointment_date", { ascending: true })
    .order("time_from", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StoredCalendarEvent[];
}

export async function getCommunityCalendarAvailability(
  workspace: AdminWorkspace,
  options: { fromDate?: string; toDate?: string } = {}
) {
  const today = startOfUtcDay(new Date());
  const fromDate = parseIsoDate(options.fromDate) ?? formatIsoDate(today);
  const toDate = parseIsoDate(options.toDate) ?? formatIsoDate(addDays(today, 6));
  if (parseDate(toDate) < parseDate(fromDate)) {
    throw new Error("toDate must be on or after fromDate.");
  }
  if (differenceInDays(parseDate(fromDate), parseDate(toDate)) > 31) {
    throw new Error("Availability can be requested for at most 31 days.");
  }

  const config = await loadTourEntrataConfig(workspace);
  const chunks: unknown[] = [];
  for (const range of splitDateRange(fromDate, toDate, 6)) {
    chunks.push(await callTourEntrata("getCalendarAvailability", {
      creds: { username: config.username },
      property_id: config.propertyId,
      fromdate: formatEntrataDate(parseDate(range.from)),
      todate: formatEntrataDate(parseDate(range.to)),
    }));
  }

  return {
    community: workspace.community,
    fromDate,
    toDate,
    availability: chunks,
    scheduled: await listCommunityCalendarEvents(workspace, { fromDate, toDate }),
  };
}

async function loadTourEntrataConfig(workspace: AdminWorkspace): Promise<TourEntrataConfig> {
  if (!workspace.community.tourCommunityId) {
    throw new Error("This community is not linked to a Tour community.");
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("Magnet")
    .select("integration_details")
    .eq("community_id", workspace.community.tourCommunityId)
    .limit(1)
    .maybeSingle<{ integration_details: Record<string, unknown> | null }>();
  if (error) throw new Error(error.message);

  const integration = data?.integration_details?.["api-entrata"];
  if (!integration || typeof integration !== "object") {
    throw new Error("Entrata is not configured for this community.");
  }

  const config = integration as Record<string, unknown>;
  const username = stringValue(config.username);
  const propertyId = stringValue(config.property_id) ?? workspace.community.entrataPropertyId;
  if (!username || !propertyId) {
    throw new Error("Entrata username or property ID is missing for this community.");
  }
  return { username, propertyId };
}

async function syncEntrataSessions(
  events: NormalizedCalendarEvent[],
  workspace: AdminWorkspace
) {
  const activeEvents = events.filter((event) => !isCancelled(event.status));
  if (activeEvents.length === 0) return;

  const supabase = getSupabaseServiceClient();
  const externalIds = activeEvents.map((event) => event.external_event_id);
  const { data: existingRows, error: existingError } = await supabase
    .from("sessions")
    .select("id,status,external_event_id")
    .eq("property_id", workspace.community.id)
    .eq("external_provider", "entrata")
    .in("external_event_id", externalIds);
  if (existingError) throw new Error(existingError.message);

  const existingByEvent = new Map(
    ((existingRows ?? []) as unknown as Array<{ id: string; status: string; external_event_id: string }>)
      .map((row) => [row.external_event_id, row])
  );

  const inserts = activeEvents
    .filter((event) => !existingByEvent.has(event.external_event_id))
    .map((event) => toSessionPayload(event, workspace));
  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("sessions")
      .insert(inserts as never)
      .select("id,status,external_event_id");
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Array<{ id: string; status: string; external_event_id: string }>) {
      existingByEvent.set(row.external_event_id, row);
    }
  }

  for (const event of activeEvents) {
    const session = existingByEvent.get(event.external_event_id);
    if (!session) continue;
    if (session.status === "scheduled") {
      const { error } = await supabase
        .from("sessions")
        .update(toSessionRefreshPayload(event) as never)
        .eq("id", session.id)
        .eq("status", "scheduled");
      if (error) throw new Error(error.message);
    }
    const { error: linkError } = await supabase
      .from("calendar_events")
      .update({ session_id: session.id } as never)
      .eq("property_id", workspace.community.id)
      .eq("provider", "entrata")
      .eq("external_event_id", event.external_event_id);
    if (linkError) throw new Error(linkError.message);
  }
}

function toSessionPayload(event: NormalizedCalendarEvent, workspace: AdminWorkspace) {
  return {
    ...toSessionRefreshPayload(event),
    status: "scheduled",
    source: "entrata",
    property_id: workspace.community.id,
    external_provider: "entrata",
    external_event_id: event.external_event_id,
    external_application_id: event.external_application_id,
    leads: event.prospect_name
      ? [{
          name: event.prospect_name,
          email: event.prospect_email,
          phone: event.prospect_phone,
          wantsSummary: true,
          createdAt: event.synced_at,
        }]
      : [],
  };
}

function toSessionRefreshPayload(event: NormalizedCalendarEvent) {
  return {
    title: buildSessionTourTitle({
      prospectName: event.prospect_name,
      preferPeopleTitle: true,
    }),
    prospect_name: event.prospect_name,
    scheduled_at: event.starts_at,
    location: null,
    notes: [
      `Synced from Entrata ${(event.event_type === "virtual" ? "virtual" : "in-person")} tour.`,
      event.external_application_id ? `Entrata application: ${event.external_application_id}` : null,
      event.notes,
    ].filter(Boolean).join("\n\n"),
    external_application_id: event.external_application_id,
  };
}

async function callTourEntrata(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${TOUR_API_BASE_URL}/api/integrations/entrata/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Tour ${method} failed with ${response.status}: ${extractTourError(payload)}`);
  }
  const payloadError = extractTourPayloadError(payload);
  if (payloadError) throw new Error(`Tour ${method} failed: ${payloadError}`);
  return payload;
}

async function enrichCalendarEventsWithPeople(
  events: NormalizedCalendarEvent[],
  config: TourEntrataConfig,
  createdFrom: string,
  createdTo: string
) {
  const unresolved = new Set(
    events
      .map((event) => event.external_application_id)
      .filter((applicationId): applicationId is string => Boolean(applicationId))
  );
  if (unresolved.size === 0) return;

  const people = new Map<string, { name: string | null; email: string | null; phone: string | null }>();
  const rangeStart = parseEntrataDate(createdFrom);
  let cursorEnd = parseEntrataDate(createdTo);

  while (cursorEnd >= rangeStart && unresolved.size > 0) {
    const cursorStart = new Date(Math.max(addDays(cursorEnd, -29).getTime(), rangeStart.getTime()));
    const payload = await callTourEntrata("getLeads", {
      creds: { username: config.username },
      property_id: config.propertyId,
      fromDate: formatEntrataDate(cursorStart),
      toDate: formatEntrataDate(cursorEnd),
    });

    for (const prospect of readEntrataProspects(payload)) {
      if (!isRecord(prospect)) continue;
      const applicationId = stringValue(prospect.applicationId);
      if (!applicationId || !unresolved.has(applicationId)) continue;

      const customer = asArray(readPath(prospect, ["customers", "customer"]))
        .find(isRecord);
      if (!customer) continue;

      const firstName = stringValue(customer.firstName);
      const lastName = stringValue(customer.lastName);
      const primaryPhone = asArray(readPath(customer, ["phones", "phone"]))
        .filter(isRecord)
        .find((phone) => Number(phone.isPrimary) === 1);
      people.set(applicationId, {
        name: [firstName, lastName].filter(Boolean).join(" ") || null,
        email: stringValue(customer.email),
        phone:
          stringValue(primaryPhone?.phoneNumber) ??
          stringValue(customer.cellPhoneNumber) ??
          stringValue(customer.personalPhoneNumber),
      });
      unresolved.delete(applicationId);
    }

    cursorEnd = addDays(cursorStart, -1);
  }

  for (const event of events) {
    if (!event.external_application_id) continue;
    const person = people.get(event.external_application_id);
    if (!person) continue;
    event.prospect_name = person.name;
    event.prospect_email = person.email;
    event.prospect_phone = person.phone;
  }
}

function readEntrataProspects(payload: unknown) {
  const prospects = readPath(payload, ["response", "result", "prospects"]);
  return asArray(prospects).flatMap((group) =>
    isRecord(group) ? asArray(group.prospect) : []
  );
}

function normalizeLeadEvents(
  payload: unknown,
  workspace: AdminWorkspace,
  fromDate: string,
  toDate: string
): NormalizedCalendarEvent[] {
  const prospects = asArray(readPath(payload, ["response", "result", "prospects", "prospect"]));
  const now = new Date().toISOString();
  const events: NormalizedCalendarEvent[] = [];

  for (const prospect of prospects) {
    if (!isRecord(prospect)) continue;
    const applicationId = stringValue(prospect.applicationId);
    const prospectEvents = asArray(readPath(prospect, ["events", "event"]));
    for (const rawEvent of prospectEvents) {
      if (!isRecord(rawEvent)) continue;
      const event = rawEvent as EntrataEvent;
      const appointmentDate = normalizeEntrataDate(stringValue(event.appointmentDate));
      if (!appointmentDate || appointmentDate < fromDate || appointmentDate > toDate) continue;

      const typeId = stringValue(event.typeId);
      const eventType =
        typeId === "449" || stringValue(event.type)?.toLowerCase().includes("virtual")
          ? "virtual"
          : typeId === "17" || stringValue(event.type)?.toLowerCase().includes("appointment")
            ? "in_person"
            : "other";
      const externalEventId =
        stringValue(event.eventId) ??
        createHash("sha256")
          .update([
            workspace.community.id,
            applicationId,
            appointmentDate,
            stringValue(event.timeFrom),
            stringValue(event.timeTo),
            typeId,
          ].join("|"))
          .digest("hex");

      events.push({
        company_id: workspace.organization.id,
        property_id: workspace.community.id,
        provider: "entrata",
        external_event_id: externalEventId,
        external_application_id: applicationId,
        event_type: eventType,
        status: normalizeEventStatus(stringValue(event.eventResult)),
        appointment_date: appointmentDate,
        starts_at: entrataAppointmentIso(event, appointmentDate, stringValue(event.timeFrom)),
        ends_at: entrataAppointmentIso(event, appointmentDate, stringValue(event.timeTo)),
        time_from: stringValue(event.timeFrom),
        time_to: stringValue(event.timeTo),
        prospect_name: null,
        prospect_email: null,
        prospect_phone: null,
        notes: stringValue(event.Comments) ?? stringValue(event.eventReason),
        raw: {
          applicationId,
          event,
        },
        synced_at: now,
        updated_at: now,
      });
    }
  }
  return events;
}

function toPublicCalendarEvent(event: NormalizedCalendarEvent) {
  return {
    externalEventId: event.external_event_id,
    applicationId: event.external_application_id,
    eventType: event.event_type,
    status: event.status,
    appointmentDate: event.appointment_date,
    timeFrom: event.time_from,
    timeTo: event.time_to,
  };
}

function normalizeEventStatus(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "scheduled";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("complete")) return "completed";
  if (normalized.includes("no show")) return "no_show";
  return normalized.replace(/\s+/g, "_");
}

function entrataAppointmentIso(event: EntrataEvent, date: string, time: string | null) {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[4]) {
    hour %= 12;
    if (match[4].toUpperCase() === "PM") hour += 12;
  }
  const timezoneText = [
    stringValue(event.eventReason),
    stringValue(event.Comments),
    stringValue(event.dateTime),
  ].filter(Boolean).join(" ");
  const abbreviation = timezoneText.match(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/)?.[1];
  const offsets: Record<string, string> = {
    EST: "-05:00", EDT: "-04:00",
    CST: "-06:00", CDT: "-05:00",
    MST: "-07:00", MDT: "-06:00",
    PST: "-08:00", PDT: "-07:00",
  };
  const offset = abbreviation ? offsets[abbreviation] : "Z";
  return `${date}T${String(hour).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}${offset}`;
}

function isCancelled(value: string) {
  return value === "cancelled" || value.includes("cancel");
}

function normalizeEntrataDate(value: string | null) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return null;
  return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
}

function splitDateRange(fromDate: string, toDate: string, maxDifference: number) {
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = parseDate(fromDate);
  const end = parseDate(toDate);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(addDays(cursor, maxDifference).getTime(), end.getTime()));
    ranges.push({ from: formatIsoDate(cursor), to: formatIsoDate(chunkEnd) });
    cursor = addDays(chunkEnd, 1);
  }
  return ranges;
}

function parseIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parseDate(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseEntrataDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid Entrata date: ${value}`);
  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function differenceInDays(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatEntrataDate(value: Date) {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

function extractTourPayloadError(payload: unknown) {
  if (!isRecord(payload)) return null;
  if (payload.success === false) return extractTourError(payload.error);
  const response = payload.response;
  if (isRecord(response) && response.error) return extractTourError(response.error);
  return null;
}

function extractTourError(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!isRecord(payload)) return "Unknown Tour API error.";
  const nestedMessage = payload.message;
  if (typeof nestedMessage === "string") return nestedMessage;
  if (isRecord(nestedMessage) && typeof nestedMessage.message === "string") {
    return nestedMessage.message;
  }
  if (payload.error) return extractTourError(payload.error);
  return "Unknown Tour API error.";
}
