import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import type { AnalysisResult, FollowUpAction, SessionSummary } from "@tour/shared";

import {
  createSession,
  fetchActions,
  fetchAnalysis,
  fetchScreenshots,
  fetchSessions,
  fetchTranscript,
  generateAnalysis,
  updateActionStatus
} from "./src/api";
import { computeDashboardMetrics } from "./src/dashboard";
export default function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [actions, setActions] = useState<FollowUpAction[]>([]);
  const [transcript, setTranscript] = useState<
    Array<{
      id: string;
      sessionId: string;
      speaker: string;
      startTime: number;
      endTime: number;
      text: string;
    }>
  >([]);
  const [screenshots, setScreenshots] = useState<
    Array<{
      id: string;
      sessionId: string;
      timestamp: number;
      imageUrl: string;
      reason: "interval" | "ai_key_moment" | "rubric_evidence";
      summary?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );
  const metrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchSessions();
      setSessions(payload.sessions);
      const firstSession = payload.sessions[0];
      if (!selectedSessionId && firstSession) {
        setSelectedSessionId(firstSession.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  const loadSessionInsights = useCallback(async (sessionId: string) => {
    const [analysisRes, actionsRes, transcriptRes, screenshotsRes] = await Promise.all([
      fetchAnalysis(sessionId),
      fetchActions(sessionId),
      fetchTranscript(sessionId),
      fetchScreenshots(sessionId)
    ]);
    setAnalysis(analysisRes.analysis);
    setActions(actionsRes.actions);
    setTranscript(transcriptRes.transcript);
    setScreenshots(screenshotsRes.screenshots);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedSessionId) {
      setAnalysis(null);
      setActions([]);
      setTranscript([]);
      setScreenshots([]);
      return;
    }

    loadSessionInsights(selectedSessionId).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load session insights.");
    });
  }, [loadSessionInsights, selectedSessionId]);

  async function handleCreateSession() {
    if (!title.trim()) {
      setError("Session title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createSession({
        title: title.trim(),
        prospectName: prospectName.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null
      });
      setTitle("");
      setProspectName("");
      setLocation("");
      setNotes("");
      await load();
      setSelectedSessionId(result.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateAnalysis() {
    if (!selectedSessionId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await generateAnalysis(selectedSessionId);
      await load();
      await loadSessionInsights(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate analysis.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActionStatus(actionId: string, status: "open" | "completed" | "dismissed") {
    if (!selectedSessionId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateActionStatus(selectedSessionId, actionId, status);
      await loadSessionInsights(selectedSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update action.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.title}>Tour Agent Mobile</Text>
        <Text style={styles.subtitle}>Create sessions, review AI analysis, and track follow-up actions.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dashboard</Text>
          <Text style={styles.sessionMeta}>Today's sessions: {metrics.todaySessions}</Text>
          <Text style={styles.sessionMeta}>Upcoming sessions: {metrics.upcomingSessions}</Text>
          <Text style={styles.sessionMeta}>Processing: {metrics.processingSessions}</Text>
          <Text style={styles.sessionMeta}>
            Avg score: {metrics.averageScore !== null ? `${metrics.averageScore}%` : "N/A"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Session</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Session title"
            style={styles.input}
          />
          <TextInput
            value={prospectName}
            onChangeText={setProspectName}
            placeholder="Prospect name"
            style={styles.input}
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Location"
            style={styles.input}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            style={[styles.input, styles.notes]}
            multiline
          />
          <Pressable onPress={handleCreateSession} style={styles.primaryButton} disabled={submitting}>
            <Text style={styles.primaryButtonText}>{submitting ? "Saving..." : "Create session"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sessions</Text>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedSessionId(item.id)}
                  style={[
                    styles.sessionItem,
                    item.id === selectedSessionId && styles.sessionItemSelected
                  ]}
                >
                  <Text style={styles.sessionTitle}>{item.title}</Text>
                  <Text style={styles.sessionMeta}>{item.status}</Text>
                  <Text style={styles.sessionMeta}>
                    {item.overallScore !== null ? `${item.overallScore}%` : "Score pending"}
                  </Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Analysis & Actions</Text>
            <Pressable
              onPress={handleGenerateAnalysis}
              style={styles.secondaryButton}
              disabled={!selectedSession || submitting}
            >
              <Text style={styles.secondaryButtonText}>Generate</Text>
            </Pressable>
          </View>

          {!selectedSession ? (
            <Text style={styles.sessionMeta}>Select a session to view details.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 260 }}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.sessionMeta}>{analysis?.summary ?? "No analysis yet."}</Text>
              <Text style={styles.sectionTitle}>Strengths</Text>
              {(analysis?.strengths ?? []).map((item) => (
                <Text key={item} style={styles.bullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.sectionTitle}>Opportunities</Text>
              {(analysis?.opportunities ?? []).map((item) => (
                <Text key={item} style={styles.bullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.sectionTitle}>Actions</Text>
              {actions.length === 0 ? (
                <Text style={styles.sessionMeta}>No actions yet.</Text>
              ) : (
                actions.map((action) => (
                  <View key={action.id} style={styles.actionItem}>
                    <Text style={styles.sessionTitle}>{action.title}</Text>
                    <Text style={styles.sessionMeta}>{action.description}</Text>
                    <Text style={styles.sessionMeta}>
                      {action.priority} · {action.status}
                    </Text>
                    <View style={[styles.row, { marginTop: 6 }]}>
                      <Pressable
                        onPress={() => handleActionStatus(action.id, "open")}
                        style={styles.secondaryButton}
                        disabled={submitting}
                      >
                        <Text style={styles.secondaryButtonText}>Open</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleActionStatus(action.id, "completed")}
                        style={styles.secondaryButton}
                        disabled={submitting}
                      >
                        <Text style={styles.secondaryButtonText}>Complete</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleActionStatus(action.id, "dismissed")}
                        style={styles.secondaryButton}
                        disabled={submitting}
                      >
                        <Text style={styles.secondaryButtonText}>Dismiss</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
              <Text style={styles.sectionTitle}>Transcript</Text>
              {transcript.map((segment) => (
                <Text key={segment.id} style={styles.sessionMeta}>
                  [{formatSeconds(segment.startTime)}] {segment.speaker}: {segment.text}
                </Text>
              ))}
              <Text style={styles.sectionTitle}>Screenshot Evidence</Text>
              {screenshots.map((shot) => (
                <Text key={shot.id} style={styles.sessionMeta}>
                  {formatSeconds(shot.timestamp)} · {shot.reason} · {shot.summary ?? "Evidence captured"}
                </Text>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  content: {
    gap: 12
  },
  container: {
    flex: 1,
    gap: 12,
    padding: 14
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "800"
  },
  subtitle: {
    color: "#475569",
    fontSize: 14,
    marginTop: -6
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600"
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  notes: {
    minHeight: 64
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sessionItem: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    padding: 10
  },
  sessionItemSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#f0fdfa"
  },
  sessionTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700"
  },
  sessionMeta: {
    color: "#475569",
    fontSize: 12
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8
  },
  bullet: {
    color: "#334155",
    fontSize: 12
  },
  actionItem: {
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 8
  }
});

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
