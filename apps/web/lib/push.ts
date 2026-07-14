import "server-only";

import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import { getSupabaseServiceClient } from "./supabase";

const expo = new Expo();

export const DEFAULT_PUSH_PREFS = {
  lowScore: true,
  newSession: true,
  analysisReady: true,
  sessionReminders: true,
  comments: true,
  weeklyReport: true,
  prospectConvert: false,
  coachingMentions: true,
} as const;

type PreferenceKey = keyof typeof DEFAULT_PUSH_PREFS;

async function getUserPreference(userId: string, key: PreferenceKey): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("notification_preferences")
    .eq("user_id", userId)
    .maybeSingle<{ notification_preferences: Record<string, boolean> | null }>();
  return Boolean({ ...DEFAULT_PUSH_PREFS, ...(data?.notification_preferences ?? {}) }[key]);
}

async function tokensForUser(userId: string): Promise<string[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ token: string }>)
    .map((row) => row.token)
    .filter((token) => Expo.isExpoPushToken(token));
}

export async function resolveAgentAuthUserId(agentId: string | null | undefined): Promise<string | null> {
  if (!agentId) return null;
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle<{ auth_user_id: string | null }>();
  return data?.auth_user_id ?? null;
}

export async function sendPushToUser(input: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  preferenceKey?: PreferenceKey;
}): Promise<{ sent: number }> {
  if (input.preferenceKey && !(await getUserPreference(input.userId, input.preferenceKey))) {
    return { sent: 0 };
  }

  const tokens = await tokensForUser(input.userId);
  if (tokens.length === 0) return { sent: 0 };

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: "default",
    title: input.title,
    body: input.body,
    data: input.data,
  }));

  const tickets = await expo.sendPushNotificationsAsync(messages);
  const sent = tickets.filter((ticket) => ticket.status === "ok").length;
  return { sent };
}

/** Notify community agents/members about a new session (best-effort). */
export async function notifyNewSession(input: {
  propertyId: string;
  sessionId: string;
  title: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: memberships } = await supabase
      .from("membership_communities")
      .select("membership_id")
      .eq("property_id", input.propertyId);
    const membershipIds = ((memberships ?? []) as Array<{ membership_id: string }>)
      .map((row) => row.membership_id);
    if (membershipIds.length === 0) return;

    const { data: members } = await supabase
      .from("company_memberships")
      .select("user_id")
      .in("id", membershipIds)
      .eq("status", "active");
    const userIds = [...new Set(((members ?? []) as Array<{ user_id: string }>).map((row) => row.user_id))];

    await Promise.all(
      userIds.map((userId) =>
        sendPushToUser({
          userId,
          preferenceKey: "newSession",
          title: "New tour session",
          body: input.title || "A new session was created",
          data: { sessionId: input.sessionId },
        }).catch(() => ({ sent: 0 })),
      ),
    );
  } catch {
    // Push must never break session creation.
  }
}

export async function notifyAnalysisReady(input: {
  agentId: string | null | undefined;
  sessionId: string;
  title: string;
  overallScore: number | null;
}): Promise<void> {
  try {
    const userId = await resolveAgentAuthUserId(input.agentId);
    if (!userId) return;
    const scoreSuffix =
      typeof input.overallScore === "number" ? ` · ${input.overallScore}%` : "";
    await sendPushToUser({
      userId,
      preferenceKey: "analysisReady",
      title: "Analysis ready",
      body: `${input.title || "Your session"} is ready to review${scoreSuffix}`,
      data: { sessionId: input.sessionId },
    });

    if (typeof input.overallScore === "number" && input.overallScore < 70) {
      await notifyLowScore({
        userId,
        sessionId: input.sessionId,
        title: input.title,
        overallScore: input.overallScore,
      });
    }
  } catch {
    // Ignore push failures.
  }
}

export async function notifyLowScore(input: {
  userId: string | null | undefined;
  sessionId: string;
  title: string;
  overallScore: number;
  threshold?: number;
}): Promise<void> {
  const threshold = input.threshold ?? 70;
  if (!input.userId || input.overallScore >= threshold) return;
  try {
    await sendPushToUser({
      userId: input.userId,
      preferenceKey: "lowScore",
      title: "Low tour score",
      body: `${input.title || "Session"} scored ${input.overallScore}%`,
      data: { sessionId: input.sessionId },
    });
  } catch {
    // Ignore push failures.
  }
}

export async function notifySessionComment(input: {
  sessionId: string;
  authorName: string;
  body: string;
  kind?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: session } = await supabase
      .from("sessions")
      .select("id,title,agent_id")
      .eq("id", input.sessionId)
      .maybeSingle<{ id: string; title: string; agent_id: string | null }>();
    if (!session) return;

    const userId = await resolveAgentAuthUserId(session.agent_id);
    if (!userId) return;

    const preview = input.body.trim().slice(0, 120);
    const isMoment = input.kind === "key_moment";
    await sendPushToUser({
      userId,
      preferenceKey: "comments",
      title: isMoment ? "New key moment" : "New session comment",
      body: `${input.authorName}: ${preview || (isMoment ? "Added a key moment" : "Left a comment")}`,
      data: { sessionId: input.sessionId },
    });
  } catch {
    // Ignore push failures.
  }
}

/** Remind agents about tours starting soon (cron). */
export async function sendUpcomingSessionReminders(windowMinutes = 60): Promise<{
  checked: number;
  sent: number;
}> {
  const supabase = getSupabaseServiceClient();
  const now = Date.now();
  const from = new Date(now + (windowMinutes - 15) * 60_000).toISOString();
  const to = new Date(now + (windowMinutes + 5) * 60_000).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .select("id,title,agent_id,scheduled_at,reminder_sent_at")
    .eq("status", "scheduled")
    .not("agent_id", "is", null)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .is("reminder_sent_at", null)
    .limit(100);

  if (error) throw new Error(error.message);
  const sessions = (data ?? []) as Array<{
    id: string;
    title: string;
    agent_id: string | null;
    scheduled_at: string;
    reminder_sent_at: string | null;
  }>;

  let sent = 0;
  for (const session of sessions) {
    const userId = await resolveAgentAuthUserId(session.agent_id);
    if (!userId) {
      await supabase
        .from("sessions")
        .update({ reminder_sent_at: new Date().toISOString() } as never)
        .eq("id", session.id);
      continue;
    }
    const when = new Date(session.scheduled_at);
    const mins = Math.max(1, Math.round((when.getTime() - now) / 60_000));
    const result = await sendPushToUser({
      userId,
      preferenceKey: "sessionReminders",
      title: "Upcoming tour",
      body: `${session.title || "Tour"} starts in about ${mins} min`,
      data: { sessionId: session.id },
    }).catch(() => ({ sent: 0 }));

    sent += result.sent;
    // Mark attempted so we don't re-spam when prefs/tokens are off.
    await supabase
      .from("sessions")
      .update({ reminder_sent_at: new Date().toISOString() } as never)
      .eq("id", session.id);
  }

  return { checked: sessions.length, sent };
}
