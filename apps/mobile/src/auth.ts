import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getApiBaseUrl } from "./config";

const SESSION_KEY = "tour.mobile.session.v1";
const BASE_URL = getApiBaseUrl();

export type MobileWorkspace = {
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

export type BusinessOption = {
  id: string;
  name: string;
  companyName: string;
  gmbId: string | null;
  alias: string | null;
  calendarConnected: boolean;
};

export type MobileAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  workspace: MobileWorkspace;
};

let currentSession: MobileAuthSession | null = null;
let refreshPromise: Promise<MobileAuthSession | null> | null = null;

export function getCurrentSession() {
  return currentSession;
}

export async function restoreSession() {
  const raw = await readStoredSession();
  if (!raw) return null;
  try {
    currentSession = JSON.parse(raw) as MobileAuthSession;
    if (currentSession.expiresAt <= Math.floor(Date.now() / 1000) + 30) {
      return await refreshSession();
    }
    return currentSession;
  } catch {
    await clearSession();
    return null;
  }
}

export async function listBusinesses(query = "") {
  const response = await fetch(
    `${BASE_URL}/api/admin/auth/businesses${query ? `?q=${encodeURIComponent(query)}` : ""}`
  );
  const body = await response.json().catch(() => null) as {
    businesses?: BusinessOption[];
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error ?? "Could not load communities.");
  return body?.businesses ?? [];
}

export async function signIn(email: string, password: string, communityId: string) {
  const response = await fetch(`${BASE_URL}/api/admin/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tour-client": "mobile",
    },
    body: JSON.stringify({ email, password, communityId }),
  });
  const body = await response.json().catch(() => null) as {
    workspace?: MobileWorkspace;
    session?: Omit<MobileAuthSession, "workspace">;
    error?: string;
  } | null;
  if (!response.ok || !body?.workspace || !body.session) {
    throw new Error(body?.error ?? "Sign in failed.");
  }
  return persistSession({ ...body.session, workspace: body.workspace });
}

export async function switchCommunity(communityId: string) {
  const response = await authenticatedFetch("/api/admin/auth/community", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ communityId }),
  });
  const body = await response.json().catch(() => null) as {
    workspace?: MobileWorkspace;
    error?: string;
  } | null;
  if (!response.ok || !body?.workspace || !currentSession) {
    throw new Error(body?.error ?? "Could not switch community.");
  }
  return persistSession({ ...currentSession, workspace: body.workspace });
}

export async function clearSession() {
  currentSession = null;
  await deleteStoredSession();
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const session = currentSession;
  if (!session) throw new Error("Sign in is required.");

  const response = await fetch(`${BASE_URL}${path}`, withAuth(init, session));
  if (response.status !== 401) return response;

  const refreshed = await refreshSession();
  if (!refreshed) return response;
  return fetch(`${BASE_URL}${path}`, withAuth(init, refreshed));
}

async function refreshSession() {
  if (!currentSession?.refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${BASE_URL}/api/admin/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tour-client": "mobile",
      },
      body: JSON.stringify({
        refreshToken: currentSession?.refreshToken,
        communityId: currentSession?.workspace.community.id,
      }),
    });
    const body = await response.json().catch(() => null) as {
      workspace?: MobileWorkspace;
      session?: Omit<MobileAuthSession, "workspace">;
    } | null;
    if (!response.ok || !body?.workspace || !body.session) {
      await clearSession();
      return null;
    }
    return persistSession({ ...body.session, workspace: body.workspace });
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function persistSession(session: MobileAuthSession) {
  currentSession = session;
  await writeStoredSession(JSON.stringify(session));
  return session;
}

function withAuth(init: RequestInit, session: MobileAuthSession): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("x-admin-community-id", session.workspace.community.id);
  headers.set("x-tour-client", "mobile");
  return { ...init, headers };
}

function readStoredSession() {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.localStorage?.getItem(SESSION_KEY) ?? null);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

function writeStoredSession(value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(SESSION_KEY, value);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(SESSION_KEY, value);
}

function deleteStoredSession() {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(SESSION_KEY);
    return Promise.resolve();
  }
  return SecureStore.deleteItemAsync(SESSION_KEY);
}
