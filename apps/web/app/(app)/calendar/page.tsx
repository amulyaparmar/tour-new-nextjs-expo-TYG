import { listSessions } from "@/lib/sessions";
import { SmartSessionForm } from "../SmartSessionForm";
import { CalendarView } from "./CalendarView";
import { requireTourWorkspace } from "@/lib/tour-auth";
import {
  getCommunityCalendarIntegration,
  listCommunityCalendarEvents,
} from "@/lib/tour-calendar";
import { EntrataCalendarSync } from "./EntrataCalendarSync";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const workspace = await requireTourWorkspace();
  const [sessions, entrataEvents, integration] = await Promise.all([
    listSessions({ propertyId: workspace.community.id }),
    listCommunityCalendarEvents(workspace),
    getCommunityCalendarIntegration(workspace),
  ]);

  return (
    <>
      <div className="page-header calendar-page-header">
        <div>
          <h1>Calendar</h1>
          <p>Local sessions and Entrata tours for {workspace.community.name}</p>
        </div>
        <EntrataCalendarSync
          status={integration.status}
          lastSyncedAt={integration.lastSyncedAt}
          stats={integration.stats}
        />
      </div>

      <details className="card create-session-collapse">
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none" }}>
          <h2>+ Add New Session</h2>
        </summary>
        <div className="card-body">
          <SmartSessionForm />
        </div>
      </details>

      {/* ── Calendar + session list ── */}
      <CalendarView sessions={sessions} entrataEvents={entrataEvents} />
    </>
  );
}
