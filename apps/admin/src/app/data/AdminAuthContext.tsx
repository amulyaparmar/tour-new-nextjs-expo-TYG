import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AdminWorkspace = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
  membership: {
    id: string;
    role: "admin" | "manager" | "member";
    companyId: string;
    companyName: string;
  };
  community: {
    id: string;
    name: string;
    tourCommunityId: number | null;
    gmbId: string | null;
    alias: string | null;
    entrataPropertyId: string | null;
  };
  communities: Array<{
    id: string;
    name: string;
    gmbId: string | null;
    alias: string | null;
  }>;
};

type AdminAuthContextValue = {
  workspace: AdminWorkspace | null;
  loading: boolean;
  login: (input: { email: string; password: string; communityId: string }) => Promise<void>;
  startSignup: (input: {
    email: string;
    password: string;
    fullName: string;
    mode: "join" | "create";
    placeId: string;
    communityId?: string | null;
    companyName?: string | null;
  }) => Promise<{ requestId: string; email: string; verified: false } | { verified: true }>;
  verifySignup: (input: { requestId: string; email: string; token: string }) => Promise<void>;
  resendSignupOtp: (input: { requestId: string; email: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchCommunity: (communityId: string) => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed with ${response.status}.`);
  }
  return body;
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/admin/auth/me"), { credentials: "include" })
      .then(readJson)
      .then((body) => {
        if (active) setWorkspace(body.workspace as AdminWorkspace);
      })
      .catch(() => {
        if (active) setWorkspace(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => ({
    workspace,
    loading,
    login: async (input) => {
      const response = await fetch(apiUrl("/api/admin/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await readJson(response);
      setWorkspace(body.workspace as AdminWorkspace);
    },
    startSignup: async (input) => {
      const response = await fetch(apiUrl("/api/admin/auth/signup/start"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await readJson(response);
      if (body.verified && body.workspace) {
        setWorkspace(body.workspace as AdminWorkspace);
        return { verified: true as const };
      }
      return {
        requestId: String(body.requestId),
        email: String(body.email),
        verified: false as const,
      };
    },
    verifySignup: async (input) => {
      const response = await fetch(apiUrl("/api/admin/auth/signup/verify"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await readJson(response);
      setWorkspace(body.workspace as AdminWorkspace);
    },
    resendSignupOtp: async (input) => {
      const response = await fetch(apiUrl("/api/admin/auth/signup/resend"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await readJson(response);
    },
    logout: async () => {
      await fetch(apiUrl("/api/admin/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
      setWorkspace(null);
    },
    switchCommunity: async (communityId) => {
      const response = await fetch(apiUrl("/api/admin/auth/community"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });
      const body = await readJson(response);
      setWorkspace(body.workspace as AdminWorkspace);
    },
  }), [loading, workspace]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return context;
}
