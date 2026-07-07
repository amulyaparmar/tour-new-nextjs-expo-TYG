import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MessageSquare,
  Star,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { SESSION_STATUS_LABELS, shopRubrics, type SessionStatus, type SessionSummary } from "@tour/shared";
import { listMaterials } from "@/lib/materials";
import { listSessions } from "@/lib/sessions";
import { requireTourWorkspace } from "@/lib/tour-auth";

type ReviewSession = {
  id: string;
  title: string;
  property: string;
  agent: string;
  prospect: string;
  tourDate: string;
  duration: string;
  rubric: string;
  score: number;
  npsSignal: number;
  flags: string[];
  priority: "High" | "Medium" | "Low";
  status: SessionStatus | "mock_review";
  href: string | null;
  source: "real" | "mock";
};

type Agent = {
  name: string;
  role: string;
  activeRubric: string;
  openReviews: number;
  completedTours: number;
  averageNps: number;
  averageScore: number;
  trend: string;
};

type Rubric = {
  name: string;
  focus: string;
  version: string;
  agents: string[];
  reviewQueue: number;
  lastUpdated: string;
  checkpoints: string[];
};

const reviewSessions: ReviewSession[] = [
  {
    id: "REV-1048",
    title: "Student housing discovery tour",
    property: "The George",
    agent: "Maya Chen",
    prospect: "Avery Brooks",
    tourDate: "Jun 11, 2026 at 10:30 AM",
    duration: "31 min",
    rubric: "Student Housing Tour QA",
    score: 84,
    npsSignal: 62,
    flags: ["Pricing objection", "Amenity follow-up"],
    priority: "High",
    status: "mock_review",
    href: null,
    source: "mock"
  },
  {
    id: "REV-1042",
    title: "Parent co-signer walkthrough",
    property: "Vic Village",
    agent: "Jordan Ellis",
    prospect: "Patricia Warren",
    tourDate: "Jun 10, 2026 at 4:15 PM",
    duration: "24 min",
    rubric: "Family Decision Maker",
    score: 78,
    npsSignal: 47,
    flags: ["Fair housing check", "Missing next step"],
    priority: "High",
    status: "mock_review",
    href: null,
    source: "mock"
  },
  {
    id: "REV-1039",
    title: "International student virtual tour",
    property: "Landmark Ann Arbor",
    agent: "Sam Rivera",
    prospect: "Noor Haddad",
    tourDate: "Jun 10, 2026 at 1:00 PM",
    duration: "19 min",
    rubric: "Virtual Tour Conversion",
    score: 91,
    npsSignal: 71,
    flags: ["Strong close"],
    priority: "Medium",
    status: "mock_review",
    href: null,
    source: "mock"
  },
  {
    id: "REV-1035",
    title: "Transfer student lease renewal",
    property: "Six11",
    agent: "Tessa Morgan",
    prospect: "Marcus Hill",
    tourDate: "Jun 9, 2026 at 2:45 PM",
    duration: "22 min",
    rubric: "Renewal Save Playbook",
    score: 73,
    npsSignal: 39,
    flags: ["Concession request", "Timeline unclear"],
    priority: "Medium",
    status: "mock_review",
    href: null,
    source: "mock"
  }
];

const agents: Agent[] = [
  {
    name: "Maya Chen",
    role: "Senior Leasing Agent",
    activeRubric: "Student Housing Tour QA",
    openReviews: 3,
    completedTours: 28,
    averageNps: 68,
    averageScore: 87,
    trend: "+8"
  },
  {
    name: "Jordan Ellis",
    role: "Leasing Agent",
    activeRubric: "Family Decision Maker",
    openReviews: 2,
    completedTours: 21,
    averageNps: 52,
    averageScore: 81,
    trend: "+3"
  },
  {
    name: "Sam Rivera",
    role: "Virtual Tour Specialist",
    activeRubric: "Virtual Tour Conversion",
    openReviews: 1,
    completedTours: 19,
    averageNps: 73,
    averageScore: 90,
    trend: "+11"
  },
  {
    name: "Tessa Morgan",
    role: "Leasing Agent",
    activeRubric: "Renewal Save Playbook",
    openReviews: 2,
    completedTours: 17,
    averageNps: 41,
    averageScore: 76,
    trend: "-4"
  }
];

const rubrics: Rubric[] = [
  {
    name: "Student Housing Tour QA",
    focus: "Discovery, budget fit, amenity positioning, and close quality",
    version: "v3.2",
    agents: ["Maya Chen"],
    reviewQueue: 3,
    lastUpdated: "Jun 4, 2026",
    checkpoints: ["Needs discovery", "Budget framing", "Roommate matching", "Clear next step"]
  },
  {
    name: "Family Decision Maker",
    focus: "Parent confidence, safety language, guarantor process, and objections",
    version: "v1.8",
    agents: ["Jordan Ellis"],
    reviewQueue: 2,
    lastUpdated: "May 29, 2026",
    checkpoints: ["Safety proof points", "Lease education", "Objection handling", "Follow-up plan"]
  },
  {
    name: "Virtual Tour Conversion",
    focus: "Screen-share flow, remote rapport, visual clarity, and urgency",
    version: "v2.1",
    agents: ["Sam Rivera"],
    reviewQueue: 1,
    lastUpdated: "Jun 6, 2026",
    checkpoints: ["Camera pacing", "Visual context", "Decision timeline", "Application CTA"]
  },
  {
    name: "Renewal Save Playbook",
    focus: "Resident context, renewal risk, concession policy, and save attempt",
    version: "v1.4",
    agents: ["Tessa Morgan"],
    reviewQueue: 2,
    lastUpdated: "Jun 2, 2026",
    checkpoints: ["Renewal reason", "Risk category", "Value recap", "Manager escalation"]
  }
];

const priorityClasses: Record<ReviewSession["priority"], string> = {
  High: "border-red-200 bg-red-50 text-red-700",
  Medium: "border-amber-200 bg-amber-50 text-amber-700",
  Low: "border-slate-200 bg-slate-50 text-slate-600"
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

function scoreColor(score: number) {
  if (score >= 85) return "text-green-700";
  if (score >= 75) return "text-amber-700";
  return "text-red-700";
}

function formatSessionDate(value: string | null) {
  if (!value) return "Date not scheduled";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function hashText(value: string) {
  return value.split("").reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

function mockNpsForSession(session: SessionSummary) {
  const base = typeof session.overallScore === "number" ? session.overallScore - 18 : 42;
  return Math.max(14, Math.min(82, base + (hashText(session.id) % 13)));
}

function priorityForSession(session: SessionSummary): ReviewSession["priority"] {
  if (session.status === "failed") return "High";
  if (session.status === "analysis_ready" && (session.overallScore ?? 0) < 82) return "High";
  if (session.status !== "reviewed" && session.status !== "scheduled") return "Medium";
  return "Low";
}

function flagsForSession(session: SessionSummary) {
  const flags: string[] = [];
  if (session.status === "analysis_ready") flags.push("Ready for manager sign-off");
  if (session.status === "failed") flags.push("Processing issue");
  if ((session.overallScore ?? 100) < 80) flags.push("Coaching opportunity");
  if (!session.prospectName) flags.push("Missing prospect name");
  if (flags.length === 0) flags.push("Manager QA sample");
  return flags.slice(0, 2);
}

function buildReviewSessions(
  realSessions: SessionSummary[],
  rubricNames: string[]
): ReviewSession[] {
  const reviewStatuses: SessionStatus[] = ["analysis_ready", "uploaded", "transcribing", "segmenting", "analyzing"];
  const ready = realSessions.filter((session) => session.status === "analysis_ready");
  const inFlight = realSessions.filter((session) => reviewStatuses.includes(session.status) && session.status !== "analysis_ready");
  const realQueue = (ready.length ? ready : [...ready, ...inFlight]).slice(0, 6);
  const sourceSessions = realQueue.length > 0 ? realQueue : realSessions.slice(0, 4);

  if (sourceSessions.length === 0) {
    return reviewSessions;
  }

  return sourceSessions.map((session, index) => {
    const agent = agents[(hashText(session.id) + index) % agents.length]!;
    const rubric = rubricNames[(hashText(session.title) + index) % rubricNames.length] ?? agent.activeRubric;
    const score = session.overallScore ?? Math.max(68, Math.min(94, 76 + (hashText(session.id) % 17)));

    return {
      id: session.id,
      title: session.title,
      property: session.location ?? "Property not set",
      agent: agent.name,
      prospect: session.prospectName ?? "Prospect not set",
      tourDate: formatSessionDate(session.scheduledAt ?? session.createdAt),
      duration: session.status === "scheduled" ? "Scheduled" : "Recorded",
      rubric,
      score,
      npsSignal: mockNpsForSession(session),
      flags: flagsForSession(session),
      priority: priorityForSession(session),
      status: session.status,
      href: `/sessions/${session.id}`,
      source: "real"
    };
  });
}

function buildRubrics(rubricNames: string[], sessions: ReviewSession[]): Rubric[] {
  if (rubricNames.length === 0) return rubrics;

  return rubricNames.slice(0, 4).map((name, index) => {
    const base = rubrics[index % rubrics.length]!;
    const assignedAgent = agents[index % agents.length]!;

    return {
      ...base,
      name,
      agents: [assignedAgent.name],
      reviewQueue: sessions.filter((session) => session.rubric === name).length,
      lastUpdated: base.lastUpdated
    };
  });
}

function statusLabel(status: ReviewSession["status"]) {
  if (status === "mock_review") return "Mock review";
  return SESSION_STATUS_LABELS[status];
}

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const workspace = await requireTourWorkspace();
  const [realSessions, materials] = await Promise.all([
    listSessions({ limit: 100, sort: "newest", propertyId: workspace.community.id }),
    listMaterials()
  ]);
  const materialRubricNames = materials
    .filter((material) => material.type === "rubric")
    .map((material) => material.name);
  const rubricNames = Array.from(new Set([
    ...materialRubricNames,
    ...shopRubrics.map((rubric) => rubric.title),
    ...rubrics.map((rubric) => rubric.name)
  ]));
  const visibleReviewSessions = buildReviewSessions(realSessions, rubricNames);
  const visibleRubrics = buildRubrics(rubricNames, visibleReviewSessions);
  const visibleAgents = agents.map((agent, index) => ({
    ...agent,
    activeRubric: visibleRubrics[index % visibleRubrics.length]?.name ?? agent.activeRubric
  }));
  const averageNps = Math.round(
    visibleAgents.reduce((sum, agent) => sum + agent.averageNps, 0) / visibleAgents.length
  );
  const openReviewCount = visibleReviewSessions.length;
  const highPriorityCount = visibleReviewSessions.filter((session) => session.priority === "High").length;
  const averageScore = Math.round(
    visibleReviewSessions.reduce((sum, session) => sum + session.score, 0) / visibleReviewSessions.length
  );
  const hasRealSessions = visibleReviewSessions.some((session) => session.source === "real");

  return (
    <div className="manager-page space-y-6">
      <div className="page-header !mb-0">
        <div className="page-header-row">
          <div>
            <h1>Manager Review</h1>
            <p>Open tour reviews, team NPS, and active coaching rubrics</p>
          </div>
          <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 sm:inline-flex">
            {hasRealSessions ? "Live sessions + mock team fields" : "Mock data"}
          </span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs review</span>
            <ClipboardCheck size={18} className="text-indigo-600" />
          </div>
          <div className="mt-4 text-3xl font-bold leading-none text-slate-900">{openReviewCount}</div>
          <div className="mt-2 text-sm font-medium text-slate-500">{highPriorityCount} high priority sessions</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team NPS</span>
            <Star size={18} className="text-amber-500" />
          </div>
          <div className="mt-4 text-3xl font-bold leading-none text-slate-900">+{averageNps}</div>
          <div className="mt-2 text-sm font-medium text-green-700">+5 vs last 30 days</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg QA score</span>
            <BarChart3 size={18} className="text-green-600" />
          </div>
          <div className="mt-4 text-3xl font-bold leading-none text-slate-900">{averageScore}%</div>
          <div className="mt-2 text-sm font-medium text-slate-500">Across open review queue</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active rubrics</span>
            <MessageSquare size={18} className="text-blue-600" />
          </div>
          <div className="mt-4 text-3xl font-bold leading-none text-slate-900">{visibleRubrics.length}</div>
          <div className="mt-2 text-sm font-medium text-slate-500">Mapped to {visibleAgents.length} agents</div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Open Tour Sessions</h2>
              <p className="text-sm font-medium text-slate-500">Sessions waiting for manager review</p>
            </div>
            <Clock3 size={18} className="text-slate-400" />
          </div>

          <div className="divide-y divide-slate-100">
            {visibleReviewSessions.map((session) => {
              const rowContent = (
                <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClasses[session.priority]}`}>
                      {session.priority}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                      {session.rubric}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {statusLabel(session.status)}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold leading-tight text-slate-900">{session.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-slate-500">
                    <span>{session.property}</span>
                    <span>{session.prospect}</span>
                    <span>{session.tourDate}</span>
                    <span>{session.duration}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.flags.map((flag) => (
                      <span key={flag} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                        <AlertTriangle size={12} />
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-3 md:flex-col md:items-end md:bg-transparent md:p-0">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                      {initials(session.agent)}
                    </div>
                    <div className="md:text-right">
                      <div className="text-sm font-bold text-slate-800">{session.agent}</div>
                      <div className="text-xs font-medium text-slate-500">NPS signal +{session.npsSignal}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-black leading-none ${scoreColor(session.score)}`}>{session.score}</div>
                    <div className="text-xs font-semibold text-slate-400">QA score</div>
                  </div>
                </div>
                </>
              );

              return session.href ? (
                <Link key={session.id} href={session.href} className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_12rem]">
                  {rowContent}
                </Link>
              ) : (
                <article key={session.id} className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_12rem]">
                  {rowContent}
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Leasing Team</h2>
              <p className="text-sm font-medium text-slate-500">Average net promoter score by agent</p>
            </div>
            <UsersRound size={18} className="text-slate-400" />
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2">
            {visibleAgents.map((agent) => (
              <article key={agent.name} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-black text-indigo-700">
                    {initials(agent.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">{agent.name}</h3>
                        <p className="text-sm font-medium text-slate-500">{agent.role}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black leading-none text-slate-900">+{agent.averageNps}</div>
                        <div className={`text-[11px] font-bold ${agent.trend.startsWith("-") ? "text-red-600" : "text-green-700"}`}>
                          {agent.trend}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <div className="text-sm font-black text-slate-900">{agent.openReviews}</div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400">Reviews</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <div className="text-sm font-black text-slate-900">{agent.completedTours}</div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400">Tours</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <div className="text-sm font-black text-slate-900">{agent.averageScore}%</div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400">Score</div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
                      Active rubric: {agent.activeRubric}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Active Rubrics</h2>
            <p className="text-xs font-medium text-slate-500">Rubrics currently applied to your team and open reviews</p>
          </div>
          <CheckCircle2 size={18} className="text-green-600" />
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2">
          {visibleRubrics.map((rubric) => (
            <article key={rubric.name} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900">{rubric.name}</h3>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{rubric.focus}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {rubric.version}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-sm font-black text-slate-900">{rubric.reviewQueue}</div>
                  <div className="text-[10px] font-semibold uppercase text-slate-400">Open reviews</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="truncate text-sm font-black text-slate-900">{rubric.agents.join(", ")}</div>
                  <div className="text-[10px] font-semibold uppercase text-slate-400">Assigned agent</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Key checkpoints
                </div>
                <div className="flex flex-wrap gap-2">
                  {rubric.checkpoints.map((checkpoint) => (
                    <span key={checkpoint} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {checkpoint}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-400">
                Last updated {rubric.lastUpdated}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
