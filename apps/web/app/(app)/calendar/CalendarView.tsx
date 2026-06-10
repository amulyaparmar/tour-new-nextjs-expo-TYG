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
import { SESSION_STATUS_LABELS } from "@tour/shared";
import { CalendarDays, List, Filter } from "lucide-react";

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

export function CalendarView({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const events = useMemo(() => sessions
    .filter((s) => s.scheduledAt)
    .map((s) => {
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
    }), [sessions]);

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
        router.push(`/sessions/${event.id}`);
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

          {/* Expanded day panel when clicking "+N more" */}
          {expandedDate && expandedSessions.length > 0 && (
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
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>All Sessions</h2>
            <span className="badge badge-scheduled" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Filter size={12} /> {sessions.length} total
            </span>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state">No sessions yet. Create your first one.</div>
          ) : (
            sessions.map((session) => (
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
