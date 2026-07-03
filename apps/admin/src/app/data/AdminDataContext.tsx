import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  agents as fallbackAgents,
  funnelData as fallbackFunnelData,
  properties as fallbackProperties,
  prospects as fallbackProspects,
  rubrics as fallbackRubrics,
  scoreDistribution as fallbackScoreDistribution,
  sessions as fallbackSessions,
  teamRadar as fallbackTeamRadar,
  trendData as fallbackTrendData,
} from "./mockData";
import { useAdminAuth } from "./AdminAuthContext";

export type AdminProperty = typeof fallbackProperties[number];
export type AdminAgent = typeof fallbackAgents[number];
export type AdminSession = Omit<typeof fallbackSessions[number], "id"> & {
  id: string;
  sectionScores?: Array<{
    section: string;
    score: number;
    pointsEarned: number;
    pointsPossible: number;
    insight: string;
    questions: Array<{
      id: string;
      question: string;
      earnedPoints: number;
      maxPoints: number;
      passed: boolean;
      evidence: string;
    }>;
  }> | null;
};
export type AdminProspect = Omit<typeof fallbackProspects[number], "tourSessionId"> & { tourSessionId: string };
export type AdminRubricItem = {
  id: string;
  text: string;
  points: number;
  note?: string;
};
export type AdminRubricCategory = {
  name: string;
  weight: number;
  description: string;
  criteria: string[];
  items?: AdminRubricItem[];
};
export type AdminRubric = Omit<typeof fallbackRubrics[number], "categories"> & {
  categories: AdminRubricCategory[];
  definition?: unknown;
  sourceUrl?: string | null;
  isDefault?: boolean;
  createdAt?: string;
};

type AdminData = {
  properties: AdminProperty[];
  agents: AdminAgent[];
  sessions: AdminSession[];
  prospects: AdminProspect[];
  rubrics: AdminRubric[];
  trendData: typeof fallbackTrendData;
  scoreDistribution: typeof fallbackScoreDistribution;
  funnelData: typeof fallbackFunnelData;
  teamRadar: typeof fallbackTeamRadar;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const fallbackData = {
  properties: fallbackProperties,
  agents: fallbackAgents,
  sessions: fallbackSessions.map((session) => ({ ...session, id: String(session.id) })),
  prospects: fallbackProspects.map((prospect) => ({ ...prospect, tourSessionId: String(prospect.tourSessionId) })),
  rubrics: fallbackRubrics,
  trendData: fallbackTrendData,
  scoreDistribution: fallbackScoreDistribution,
  funnelData: fallbackFunnelData,
  teamRadar: fallbackTeamRadar,
};

const emptyData: typeof fallbackData = {
  properties: [],
  agents: [],
  sessions: [],
  prospects: [],
  rubrics: [],
  trendData: [],
  scoreDistribution: [],
  funnelData: [],
  teamRadar: [],
};

const AdminDataContext = createContext<AdminData | null>(null);

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const { workspace } = useAdminAuth();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(apiUrl("/api/admin/bootstrap"), {
          credentials: "include",
          cache: "no-store",
        });
        if (response.ok || response.status < 500) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
      if (!response) throw new Error("Admin API did not respond.");
      const next = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof next.error === "string"
            ? next.error
            : `Admin API returned ${response.status}`
        );
      }
      setData({
        ...emptyData,
        ...next,
        sessions: (next.sessions ?? []).map((session: AdminSession) => ({
          ...session,
          id: String(session.id),
        })),
        prospects: (next.prospects ?? []).map((prospect: AdminProspect) => ({
          ...prospect,
          tourSessionId: String(prospect.tourSessionId),
        })),
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [workspace?.community.id]);

  const value = useMemo<AdminData>(() => ({
    ...data,
    loading,
    error,
    refresh,
  }), [data, loading, error]);

  return (
    <AdminDataContext.Provider value={value}>
      {loading && data.sessions.length === 0 ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-sm font-semibold text-muted-foreground">Loading workspace data...</div>
        </div>
      ) : (
        <>
          {error && (
            <div className="fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-md border border-red-200 bg-white px-4 py-3 shadow-lg">
              <span className="text-sm font-semibold text-red-700">{error}</span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="text-sm font-bold text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          {children}
        </>
      )}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error("useAdminData must be used inside AdminDataProvider");
  }
  return context;
}
