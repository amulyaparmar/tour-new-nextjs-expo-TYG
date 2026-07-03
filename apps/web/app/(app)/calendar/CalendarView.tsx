"use client";

import "temporal-polyfill/global";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createEventModalPlugin } from "@schedule-x/event-modal";
import "@schedule-x/theme-default/dist/index.css";

import type { SessionSummary } from "@tour/shared";
import type { StoredCalendarEvent } from "@/lib/tour-calendar";
import { SESSION_STATUS_LABELS } from "@tour/shared";
import { Building2, CalendarDays, Filter, List, Mail, MonitorPlay, Phone } from "lucide-react";

function toSxDateTime(d: Date) {
  return Temporal.ZonedDateTime.from({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    timeZone: Temporal.Now.timeZoneId()
  });
}

function parseEntrataDateTime(date: string, time: string | null) {
  const [year, month, day] = date.split("-").map(Number);
  let hour = 9;
  let minute = 0;
  if (time) {
    const twelveHour = time.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
    const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})/);
    if (twelveHour) {
      hour = Number(twelveHour[1]) % 12;
      if (twelveHour[3]?.toUpperCase() === "PM") hour += 12;
      minute = Number(twelveHour[2]);
    } else if (twentyFourHour) {
      hour = Number(twentyFourHour[1]);
      minute = Number(twentyFourHour[2]);
    }
  }
  return new Date(year!, month! - 1, day!, hour, minute);
}

function entrataTitle(event: StoredCalendarEvent) {
  const type = event.event_type === "virtual" ? "Virtual tour" : "In-person tour";
  return `Entrata · ${event.prospect_name ?? type}`;
}

function formatEntrataTime(time: string | null) {
  if (!time) return "Time TBD";
  const twelveHour = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    return `${Number(twelveHour[1])}:${twelveHour[2]} ${twelveHour[3]!.toUpperCase()}`;
  }
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})/);
  if (!twentyFourHour) return time;
  const value = new Date(2000, 0, 1, Number(twentyFourHour[1]), Number(twentyFourHour[2]));
  return value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function EntrataTourRow({
  event,
  onClick,
}: {
  event: StoredCalendarEvent;
  onClick: () => void;
}) {
  const tourType = event.event_type === "virtual" ? "Virtual tour" : "In-person tour";
  return (
    <button type="button" className="entrata-tour-row" onClick={onClick}>
      <span className="entrata-tour-row-icon" aria-hidden="true">
        {event.event_type === "virtual" ? <MonitorPlay size={17} /> : <Building2 size={17} />}
      </span>
      <span className="entrata-tour-row-content">
        <strong>{event.prospect_name ?? tourType}</strong>
        <small>
          {new Date(`${event.appointment_date}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {" · "}
          {formatEntrataTime(event.time_from)}
          {" · "}
          {event.prospect_name ? tourType : "Entrata"}
        </small>
      </span>
      <span className={`badge ${isCancelledStatus(event.status) ? "badge-dismissed" : "badge-scheduled"}`}>
        {event.status.replaceAll("_", " ")}
      </span>
    </button>
  );
}

function isCancelledStatus(status: string) {
  return status.includes("cancel");
}

export function CalendarView({
  sessions,
  entrataEvents,
}: {
  sessions: SessionSummary[];
  entrataEvents: StoredCalendarEvent[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [selectedEntrataId, setSelectedEntrataId] = useState<string | null>(null);

  const events = useMemo(() => {
    const localEvents = sessions.filter((s) => s.scheduledAt).map((s) => {
      const start = new Date(s.scheduledAt!);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return {
        id: s.id,
        title: s.title,
        start: toSxDateTime(start),
        end: toSxDateTime(end),
        description: [
          s.prospectName ?? "",
          s.location ?? "",
          `Status: ${SESSION_STATUS_LABELS[s.status]}`,
          s.overallScore !== null ? `Score: ${s.overallScore}%` : ""
        ].filter(Boolean).join(" | ")
      };
    });
    const externalEvents = entrataEvents.map((event) => {
      const start = parseEntrataDateTime(event.appointment_date, event.time_from);
      const end = event.time_to
        ? parseEntrataDateTime(event.appointment_date, event.time_to)
        : new Date(start.getTime() + 30 * 60 * 1000);
      return {
        id: `entrata-${event.external_event_id}`,
        title: entrataTitle(event),
        start: toSxDateTime(start),
        end: toSxDateTime(end),
        description: [
          event.event_type === "virtual" ? "Virtual tour" : "In-person tour",
          event.status,
          event.external_application_id ? `Application ${event.external_application_id}` : "",
        ].filter(Boolean).join(" | "),
      };
    });
    return [...localEvents, ...externalEvents];
  }, [entrataEvents, sessions]);

  const [eventsService] = useState(() => createEventsServicePlugin());
  const [eventModal] = useState(() => createEventModalPlugin());

  const calendar = useCalendarApp({
    views: [createViewMonthGrid(), createViewWeek()],
    defaultView: createViewMonthGrid().name,
    events,
    monthGridOptions: {
      nEventsPerDay: 3
    },
    callbacks: {
      onEventClick(event) {
        const eventId = String(event.id);
        if (eventId.startsWith("entrata-")) {
          const externalId = eventId.slice("entrata-".length);
          const entrataEvent = entrataEvents.find((item) => item.external_event_id === externalId);
          if (entrataEvent?.session_id) {
            router.push(`/sessions/${entrataEvent.session_id}`);
          } else {
            setSelectedEntrataId(externalId);
          }
        } else {
          router.push(`/sessions/${eventId}`);
        }
      },
      onClickPlusEvents(date) {
        setExpandedDate((prev) => (prev === String(date) ? null : String(date)));
      }
    }
  }, [eventsService, eventModal]);

  useEffect(() => {
    if (eventsService.set) eventsService.set(events);
  }, [events, eventsService]);

  const expandedSessions = useMemo(() => {
    if (!expandedDate) return [];
    return sessions.filter((s) => {
      if (!s.scheduledAt) return false;
      const d = new Date(s.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return dateStr === expandedDate;
    });
  }, [expandedDate, sessions]);

  const expandedEntrataEvents = useMemo(() => {
    if (!expandedDate) return [];
    return entrataEvents.filter((event) => event.appointment_date === expandedDate);
  }, [entrataEvents, expandedDate]);

  const selectedEntrata = entrataEvents.find((event) => event.external_event_id === selectedEntrataId) ?? null;

  const unscheduled = sessions.filter((s) => !s.scheduledAt);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={`toggle-tab ${view === "calendar" ? "active" : ""}`}
          onClick={() => setView("calendar")}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <CalendarDays size={14} /> Calendar
        </button>
        <button
          type="button"
          className={`toggle-tab ${view === "list" ? "active" : ""}`}
          onClick={() => setView("list")}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <List size={14} /> List
        </button>
      </div>

      {view === "calendar" ? (
        <>
          <div className="card sx-calendar-wrap">
            {calendar && <ScheduleXCalendar calendarApp={calendar} />}
          </div>

          {selectedEntrata && (
            <div className="card entrata-event-detail">
              <div className="card-header">
                <div>
                  <span className="badge badge-source-qr">Entrata</span>
                  <h2>{entrataTitle(selectedEntrata)}</h2>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedEntrataId(null)}>Close</button>
              </div>
              <div className="card-body entrata-event-grid">
                <div><span>Date</span><strong>{new Date(`${selectedEntrata.appointment_date}T00:00:00`).toLocaleDateString()}</strong></div>
                <div><span>Time</span><strong>{formatEntrataTime(selectedEntrata.time_from)}{selectedEntrata.time_to ? ` – ${formatEntrataTime(selectedEntrata.time_to)}` : ""}</strong></div>
                <div><span>Type</span><strong>{selectedEntrata.event_type === "virtual" ? "Virtual tour" : "In-person tour"}</strong></div>
                <div><span>Status</span><strong>{selectedEntrata.status.replaceAll("_", " ")}</strong></div>
                {selectedEntrata.prospect_name && <div><span>Prospect</span><strong>{selectedEntrata.prospect_name}</strong></div>}
                {selectedEntrata.prospect_email && <div><span>Email</span><a href={`mailto:${selectedEntrata.prospect_email}`}><Mail size={13} />{selectedEntrata.prospect_email}</a></div>}
                {selectedEntrata.prospect_phone && <div><span>Phone</span><a href={`tel:${selectedEntrata.prospect_phone}`}><Phone size={13} />{selectedEntrata.prospect_phone}</a></div>}
                {selectedEntrata.external_application_id && <div><span>Application</span><strong>{selectedEntrata.external_application_id}</strong></div>}
              </div>
            </div>
          )}

          {/* Expanded day panel when clicking "+N more" */}
          {expandedDate && (expandedSessions.length > 0 || expandedEntrataEvents.length > 0) && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header">
                <h2>
                  Sessions on {new Date(expandedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedDate(null)}>
                  Close
                </button>
              </div>
              {expandedSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`} className="session-row">
                  <span className="session-row-time">
                    {session.scheduledAt
                      ? new Date(session.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                      : ""}
                  </span>
                  <div className="session-row-info">
                    <div className="session-row-title">{session.title}</div>
                    <div className="session-row-meta">
                      {session.prospectName ?? "No prospect"}
                      {session.location ? ` \u00B7 ${session.location}` : ""}
                    </div>
                  </div>
                  <span className={`badge badge-${session.status}`}>
                    {SESSION_STATUS_LABELS[session.status]}
                  </span>
                  {session.overallScore !== null && (
                    <span className="session-row-score">{session.overallScore}%</span>
                  )}
                </Link>
              ))}
              {expandedEntrataEvents.map((event) => (
                <EntrataTourRow
                  key={event.external_event_id}
                  event={event}
                  onClick={() => event.session_id
                    ? router.push(`/sessions/${event.session_id}`)
                    : setSelectedEntrataId(event.external_event_id)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>All calendar items</h2>
            <span className="badge badge-scheduled" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Filter size={12} /> {sessions.length + entrataEvents.length} total
            </span>
          </div>
          {entrataEvents.length > 0 && (
            <>
              <div className="calendar-source-heading"><Building2 size={15} /><strong>Entrata tours</strong><span>{entrataEvents.length}</span></div>
              {entrataEvents.map((event) => (
                <EntrataTourRow
                  key={event.external_event_id}
                  event={event}
                  onClick={() => {
                    if (event.session_id) {
                      router.push(`/sessions/${event.session_id}`);
                    } else {
                      setSelectedEntrataId(event.external_event_id);
                      setView("calendar");
                    }
                  }}
                />
              ))}
            </>
          )}

          <div className="calendar-source-heading"><CalendarDays size={15} /><strong>Tour sessions</strong><span>{sessions.length}</span></div>
          {sessions.length === 0 ? (
            <div className="empty-state">No local sessions yet.</div>
          ) : (
            sessions.filter((session) => session.scheduledAt).map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`} className="session-row">
                <div className="session-row-info">
                  <div className="session-row-title">{session.title}</div>
                  <div className="session-row-meta">
                    {session.prospectName ?? "No prospect"}
                    {session.scheduledAt ? ` \u00B7 ${new Date(session.scheduledAt).toLocaleString()}` : " \u00B7 Unscheduled"}
                  </div>
                </div>
                <span className={`badge badge-${session.status}`}>
                  {SESSION_STATUS_LABELS[session.status]}
                </span>
                {session.overallScore !== null && (
                  <span className="session-row-score">{session.overallScore}%</span>
                )}
              </Link>
            ))
          )}

          {unscheduled.length > 0 && (
            <>
              <div className="card-header" style={{ borderTop: "1px solid var(--slate-100)" }}>
                <h2>Unscheduled</h2>
                <span className="badge badge-open">{unscheduled.length}</span>
              </div>
              {unscheduled.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`} className="session-row">
                  <div className="session-row-info">
                    <div className="session-row-title">{session.title}</div>
                    <div className="session-row-meta">{session.prospectName ?? "No prospect"}</div>
                  </div>
                  <span className={`badge badge-${session.status}`}>
                    {SESSION_STATUS_LABELS[session.status]}
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
