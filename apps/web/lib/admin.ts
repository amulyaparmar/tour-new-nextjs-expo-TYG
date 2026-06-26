import "server-only";

import type { AnalysisResult, Rubric, SessionLead, SessionSummary } from "@tour/shared";

import { listRubrics } from "./rubrics";
import { getSupabaseServiceClient } from "./supabase";
import { listSessions } from "./sessions";

export type AdminProperty = {
  id: string;
  name: string;
};

export type AdminAgent = {
  id: string;
  name: string;
  full: string;
  role: string;
  propertyId: string | null;
  toursThisMonth: number;
  avgScore: number;
  trend: "up" | "down";
  weeklyScores: number[];
  rubricBreakdown: Array<{ axis: string; score: number }>;
  coachingCount: number;
};

export type AdminSession = {
  id: string;
  prospect: string;
  unit: string;
  propertyId: string | null;
  property: string;
  date: string;
  duration: string;
  score: number | null;
  status: "scored" | "processing";
  agentId: string | null;
  agent: string;
  tags: string[];
  rubricId: string | null;
};

export type AdminProspect = {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string | null;
  property: string;
  unit: string;
  agentId: string | null;
  agent: string;
  tourSessionId: string;
  tourDate: string;
  score: number | null;
  followUpStatus: "pending" | "sent" | "converted" | "lost";
  lastContact: string;
  nextFollowUp: string | null;
  notes: Array<{ text: string; timestamp: string; author: string }>;
  followUpActions: string[];
};

export type AdminBootstrap = {
  properties: AdminProperty[];
  agents: AdminAgent[];
  sessions: AdminSession[];
  prospects: AdminProspect[];
  rubrics: Array<Rubric & {
    version: string;
    status: "active" | "draft";
    propertyIds: string[];
    sessionCount: number;
    lastUpdated: string;
    categories: Array<{
      name: string;
      weight: number;
      description: string;
      criteria: string[];
      items: Array<{
        id: string;
        text: string;
        points: number;
        note?: string;
      }>;
    }>;
  }>;
  trendData: Array<Record<string, number | string>>;
  scoreDistribution: Array<{ band: string; count: number }>;
  funnelData: Array<{ stage: string; value: number }>;
  teamRadar: Array<{ axis: string; score: number }>;
};

type AgentRow = {
  id: string;
  name: string;
  full_name: string;
  role: string;
  property_id: string | null;
};

type PropertyRow = {
  id: string;
  name: string;
};

type FollowUpRow = {
  session_id: string;
  lead_index: number;
  status: "pending" | "sent" | "converted" | "lost";
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  notes: Array<{ text: string; timestamp: string; author: string }> | null;
};

const FALLBACK_PROPERTIES: AdminProperty[] = [
  { id: "p1", name: "The Meridian" },
  { id: "p2", name: "Parkview Lofts" },
  { id: "p3", name: "Cedar Commons" },
  { id: "p4", name: "Riverton Heights" },
];

const FALLBACK_AGENTS: AgentRow[] = [
  { id: "a1", name: "Sarah K.", full_name: "Sarah Kowalski", role: "Senior Leasing Agent", property_id: "p1" },
  { id: "a2", name: "Marcus T.", full_name: "Marcus Torres", role: "Leasing Agent", property_id: "p2" },
  { id: "a3", name: "James R.", full_name: "James Rivera", role: "Leasing Agent", property_id: "p3" },
  { id: "a4", name: "Priya S.", full_name: "Priya Sharma", role: "Senior Leasing Agent", property_id: "p4" },
];

const RUBRIC_AXES = ["Opening", "Discovery", "Showcase", "Objections", "Closing", "Follow-up"];

export async function getAdminBootstrap(): Promise<AdminBootstrap> {
  const [rawProperties, rawAgents, sessions, rubrics, followUps] = await Promise.all([
    listAdminProperties(),
    listAdminAgents(),
    listSessions({ limit: 100, sort: "newest" }),
    listRubrics(),
    listProspectFollowUps(),
  ]);

  const properties = rawProperties.length > 0 ? rawProperties : FALLBACK_PROPERTIES;
  const agents = buildAgents(rawAgents.length > 0 ? rawAgents : FALLBACK_AGENTS, sessions);
  const adminSessions = sessions.map((session, index) =>
    mapAdminSession(session, properties, agents, index)
  );
  const prospects = buildProspects(adminSessions, sessions, followUps);
  const trendData = buildTrendData(agents);
  const scoreDistribution = buildScoreDistribution(adminSessions);
  const teamRadar = buildTeamRadar(agents);

  return {
    properties,
    agents,
    sessions: adminSessions,
    prospects,
    rubrics: rubrics.map((rubric) => mapAdminRubric(rubric, adminSessions)),
    trendData,
    scoreDistribution,
    funnelData: [
      { stage: "Tours", value: adminSessions.length },
      { stage: "Applications", value: Math.max(0, Math.round(adminSessions.length * 0.6)) },
      { stage: "Leases", value: Math.max(0, Math.round(adminSessions.length * 0.35)) },
    ],
    teamRadar,
  };
}

async function listAdminProperties(): Promise<AdminProperty[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("admin_properties")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data as PropertyRow[] | null) ?? []).map((row) => ({ id: row.id, name: row.name }));
  } catch {
    return FALLBACK_PROPERTIES;
  }
}

async function listAdminAgents(): Promise<AgentRow[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("admin_agents")
      .select("id,name,full_name,role,property_id")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as AgentRow[] | null) ?? [];
  } catch {
    return FALLBACK_AGENTS;
  }
}

async function listProspectFollowUps(): Promise<FollowUpRow[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("prospect_follow_ups")
      .select("session_id,lead_index,status,last_contact_at,next_follow_up_at,notes");
    if (error) throw new Error(error.message);
    return (data as FollowUpRow[] | null) ?? [];
  } catch {
    return [];
  }
}

function buildAgents(rows: AgentRow[], sessions: SessionSummary[]): AdminAgent[] {
  return rows.map((row) => {
    const agentSessions = sessions.filter((session) => session.agentId === row.id);
    const scored = agentSessions.filter((session) => typeof session.overallScore === "number");
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, session) => sum + (session.overallScore ?? 0), 0) / scored.length)
      : 0;
    const weeklyScores = buildWeeklyScores(scored.map((session) => session.overallScore ?? 0), avgScore);
    const rubricBreakdown = RUBRIC_AXES.map((axis, index) => ({
      axis,
      score: clampScore(avgScore + [5, -3, 2, -6, 1, -2][index]!),
    }));

    return {
      id: row.id,
      name: row.name,
      full: row.full_name,
      role: row.role,
      propertyId: row.property_id,
      toursThisMonth: agentSessions.length,
      avgScore,
      trend: weeklyScores[weeklyScores.length - 1]! >= weeklyScores[0]! ? "up" : "down",
      weeklyScores,
      rubricBreakdown,
      coachingCount: Math.max(0, agentSessions.filter((session) => (session.overallScore ?? 100) < 75).length * 2),
    };
  });
}

function mapAdminSession(
  session: SessionSummary,
  properties: AdminProperty[],
  agents: AdminAgent[],
  index: number
): AdminSession {
  const agent = agents.find((item) => item.id === session.agentId) ?? agents[index % Math.max(agents.length, 1)];
  const property =
    properties.find((item) => item.id === session.propertyId) ??
    properties.find((item) => item.id === agent?.propertyId) ??
    properties[index % Math.max(properties.length, 1)];
  const firstLead = session.leads[0];
  const prospect = session.prospectName ?? firstLead?.name ?? session.title;

  return {
    id: session.id,
    prospect,
    unit: session.unitLabel ?? session.location ?? "Unit TBD",
    propertyId: property?.id ?? session.propertyId ?? null,
    property: property?.name ?? session.location ?? "Property",
    date: formatDate(session.scheduledAt ?? session.createdAt),
    duration: formatDuration(session.duration),
    score: typeof session.overallScore === "number" ? Math.round(session.overallScore) : null,
    status: typeof session.overallScore === "number" ? "scored" : "processing",
    agentId: agent?.id ?? session.agentId ?? null,
    agent: agent?.name ?? "Unassigned",
    tags: buildSessionTags(session),
    rubricId: session.rubricId,
  };
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function buildProspects(
  adminSessions: AdminSession[],
  sessions: SessionSummary[],
  followUps: FollowUpRow[]
): AdminProspect[] {
  return adminSessions.flatMap((adminSession) => {
    const source = sessions.find((session) => session.id === adminSession.id);
    const leads = source?.leads.length ? source.leads : [null];

    return leads.map((lead, index) => {
      const followUp = followUps.find((row) => row.session_id === adminSession.id && row.lead_index === index);
      const person = lead ?? fallbackLead(adminSession);
      return {
        id: `${adminSession.id}:${index}`,
        name: person.name,
        email: person.email ?? "",
        phone: person.phone ?? "",
        propertyId: adminSession.propertyId,
        property: adminSession.property,
        unit: adminSession.unit,
        agentId: adminSession.agentId,
        agent: adminSession.agent,
        tourSessionId: adminSession.id,
        tourDate: adminSession.date,
        score: adminSession.score,
        followUpStatus: followUp?.status ?? "pending",
        lastContact: formatDate(followUp?.last_contact_at ?? source?.createdAt ?? null),
        nextFollowUp: followUp?.next_follow_up_at ? formatDate(followUp.next_follow_up_at) : null,
        notes: followUp?.notes ?? [],
        followUpActions: adminSession.tags.length ? adminSession.tags.map((tag) => `Follow up on ${tag}.`) : [],
      };
    });
  });
}

function mapAdminRubric(rubric: Rubric, sessions: AdminSession[]): AdminBootstrap["rubrics"][number] {
  return {
    ...rubric,
    version: rubric.isDefault ? "v1" : "v1",
    status: rubric.isDefault ? "active" : "draft",
    propertyIds: FALLBACK_PROPERTIES.map((property) => property.id),
    sessionCount: sessions.filter((session) => session.rubricId === rubric.id).length,
    lastUpdated: formatDate(rubric.createdAt),
    categories: rubric.definition.sections.map((section) => ({
      name: section.name,
      weight: section.items.reduce((sum, item) => sum + item.points, 0),
      description: section.items[0]?.note ?? "",
      criteria: section.items.map((item) => item.text),
      items: section.items.map((item) => ({
        id: item.id,
        text: item.text,
        points: item.points,
        note: item.note,
      })),
    })),
  };
}

function buildTrendData(agents: AdminAgent[]): Array<Record<string, number | string>> {
  return Array.from({ length: 6 }).map((_, index) => {
    const row: Record<string, number | string> = { week: index < 4 ? `May W${index + 1}` : `Jun W${index - 3}` };
    let total = 0;
    for (const agent of agents) {
      const score = agent.weeklyScores[index + 2] ?? agent.avgScore;
      row[agent.name] = score;
      total += score;
    }
    row.avg = agents.length ? Math.round(total / agents.length) : 0;
    return row;
  });
}

function buildScoreDistribution(sessions: AdminSession[]) {
  const bands = [
    { band: "0-59", min: 0, max: 59, count: 0 },
    { band: "60-69", min: 60, max: 69, count: 0 },
    { band: "70-79", min: 70, max: 79, count: 0 },
    { band: "80-89", min: 80, max: 89, count: 0 },
    { band: "90-100", min: 90, max: 100, count: 0 },
  ];
  for (const session of sessions) {
    if (session.score === null) continue;
    const band = bands.find((item) => session.score! >= item.min && session.score! <= item.max);
    if (band) band.count += 1;
  }
  return bands.map(({ band, count }) => ({ band, count }));
}

function buildTeamRadar(agents: AdminAgent[]) {
  return RUBRIC_AXES.map((axis) => {
    const scores = agents.map((agent) => agent.rubricBreakdown.find((item) => item.axis === axis)?.score ?? 0);
    return {
      axis,
      score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    };
  });
}

function buildWeeklyScores(scores: number[], fallback: number): number[] {
  const base = fallback || 70;
  return Array.from({ length: 8 }).map((_, index) => {
    const actual = scores[index % Math.max(scores.length, 1)];
    return clampScore((actual || base) + index - 4);
  });
}

function buildSessionTags(session: SessionSummary): string[] {
  const tags: string[] = [];
  if ((session.overallScore ?? 100) < 70) tags.push("needs review");
  if ((session.overallScore ?? 0) >= 85) tags.push("strong tour");
  if (session.status !== "analysis_ready" && session.status !== "reviewed") tags.push(session.status.replaceAll("_", " "));
  return tags;
}

function fallbackLead(session: AdminSession): SessionLead {
  return {
    name: session.prospect,
    email: null,
    phone: null,
    wantsSummary: false,
    createdAt: new Date().toISOString(),
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
