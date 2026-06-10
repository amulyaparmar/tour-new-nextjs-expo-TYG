"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import type { SessionSummary } from "@tour/shared";
import { SESSION_STATUS_LABELS } from "@tour/shared";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarView({ sessions }: { sessions: SessionSummary[] }) {
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [month, setMonth] = useState(new Date());

  const sessionDates = useMemo(() => {
    const dates: Date[] = [];
    for (const s of sessions) {
      if (s.scheduledAt) dates.push(new Date(s.scheduledAt));
    }
    return dates;
  }, [sessions]);

  const sessionsForDay = useMemo(() => {
    if (!selectedDay) return sessions;
    return sessions.filter((s) => {
      if (!s.scheduledAt) return false;
      return isSameDay(new Date(s.scheduledAt), selectedDay);
    });
  }, [sessions, selectedDay]);

  const unscheduled = sessions.filter((s) => !s.scheduledAt);

  return (
    <div className="calendar-view-grid">
      {/* ── Calendar widget ── */}
      <div className="card calendar-widget">
        <div className="card-header">
          <h2>Calendar</h2>
          {selectedDay && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedDay(undefined)}
            >
              Show all
            </button>
          )}
        </div>
        <div className="calendar-picker-wrap">
          <DayPicker
            mode="single"
            selected={selectedDay}
            onSelect={setSelectedDay}
            month={month}
            onMonthChange={setMonth}
            modifiers={{ hasSession: sessionDates }}
            modifiersClassNames={{ hasSession: "day-has-session" }}
          />
        </div>
        <div className="calendar-legend">
          <span className="legend-dot" />
          <span className="legend-label">Has sessions</span>
        </div>
      </div>

      {/* ── Session list ── */}
      <div className="card">
        <div className="card-header">
          <h2>
            {selectedDay
              ? `Sessions on ${selectedDay.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
              : "All Sessions"}
          </h2>
          <span className="badge badge-scheduled">{sessionsForDay.length} session{sessionsForDay.length !== 1 ? "s" : ""}</span>
        </div>

        {sessionsForDay.length === 0 && unscheduled.length === 0 ? (
          <div className="empty-state">
            {selectedDay
              ? "No sessions on this date."
              : "No sessions yet. Create your first one."}
          </div>
        ) : (
          <>
            {sessionsForDay.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`} className="session-row">
                <div className="session-row-info">
                  <div className="session-row-title">{session.title}</div>
                  <div className="session-row-meta">
                    {session.prospectName ?? "No prospect"} · {session.location ?? "No location"}
                    {session.scheduledAt
                      ? ` · ${new Date(session.scheduledAt).toLocaleString()}`
                      : " · Unscheduled"}
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

            {!selectedDay && unscheduled.length > 0 && (
              <>
                <div className="card-header" style={{ borderTop: "1px solid var(--slate-100)" }}>
                  <h2>Unscheduled</h2>
                  <span className="badge badge-open">{unscheduled.length}</span>
                </div>
                {unscheduled.map((session) => (
                  <Link key={session.id} href={`/sessions/${session.id}`} className="session-row">
                    <div className="session-row-info">
                      <div className="session-row-title">{session.title}</div>
                      <div className="session-row-meta">
                        {session.prospectName ?? "No prospect"} · {session.location ?? "No location"}
                      </div>
                    </div>
                    <span className={`badge badge-${session.status}`}>
                      {SESSION_STATUS_LABELS[session.status]}
                    </span>
                  </Link>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
