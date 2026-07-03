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

const AdminDataContext = createContext<AdminData | null>(null);

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(fallbackData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/admin/bootstrap"));
      if (!response.ok) throw new Error(`Admin API returned ${response.status}`);
      const next = await response.json();
      setData({
        ...fallbackData,
        ...next,
        sessions: (next.sessions ?? fallbackData.sessions).map((session: AdminSession) => ({
          ...session,
          id: String(session.id),
        })),
        prospects: (next.prospects ?? fallbackData.prospects).map((prospect: AdminProspect) => ({
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
  }, []);

  const value = useMemo<AdminData>(() => ({
    ...data,
    loading,
    error,
    refresh,
  }), [data, loading, error]);

  return (
    <AdminDataContext.Provider value={value}>
      {children}
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
