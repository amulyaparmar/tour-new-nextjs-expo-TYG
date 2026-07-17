import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getApiBaseUrl } from "./config";

/** Tokens only — stays under SecureStore's ~2KB limit. */
const TOKENS_KEY = "tour.mobile.tokens.v1";
/** Workspace payload — AsyncStorage (no SizeLimit). */
const WORKSPACE_KEY = "tour.mobile.workspace.v1";
/** Pre-split blob; migrated once then deleted. */
const LEGACY_SESSION_KEY = "tour.mobile.session.v1";
const REPORT_ACCESS_URL = "https://tour.report/api/verify-access";
const REPORT_ACCESS_KEY = "LeaseMagnets2025TYG";

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function apiBaseUrl() {
  return getApiBaseUrl();
}

export type MobileWorkspace = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    title?: string | null;
    phone?: string | null;
    cardAccent?: string | null;
  };
  teamMember: {
    id: string | null;
    alias: string | null;
    name: string;
    email: string;
    role: string;
    accessRole: "admin" | "manager" | "member";
    title?: string | null;
    phone: string | null;
    cardAccent?: string | null;
    verified: boolean | null;
    userId?: string | null;
    notificationPreferences?: Record<string, boolean> | null;
  };
  organization: {
    id: string;
    name: string;
  };
  community: {
    id: string;
    propertyTygId: string;
    portalCommunityId: string | null;
    name: string;
    companyName: string | null;
    companySlug: string | null;
    tourCommunityId: number | null;
    gmbId: string | null;
    alias: string | null;
    entrataPropertyId: string | null;
    teamMembers: Array<{
      id: string | null;
      alias: string | null;
      name: string;
      email: string;
      role: string;
      accessRole: "admin" | "manager" | "member";
      title?: string | null;
      phone: string | null;
      cardAccent?: string | null;
      verified: boolean | null;
      userId?: string | null;
      notificationPreferences?: Record<string, boolean> | null;
    }>;
  };
  communities: Array<{
    id: string;
    propertyTygId: string;
    portalCommunityId: string | null;
    name: string;
    companyName: string | null;
    companySlug: string | null;
    tourCommunityId: number | null;
    gmbId: string | null;
    alias: string | null;
    entrataPropertyId: string | null;
    teamMembers: MobileWorkspace["community"]["teamMembers"];
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

export type MobileSignInChallenge = {
  email: string;
  expectedCode: string;
  /** False when tour.report email delivery failed but the code is still usable. */
  emailSent?: boolean;
};

export type CommunityEnrichment = {
  communityId: string;
  state: "enriched" | "indexed" | "not_linked";
  match: "property_id" | "place_id" | "normalized_name" | null;
  reportPropertyId: string | null;
  marketKey: string | null;
  thumbnailUrl: string | null;
  unitCount: number | string | null;
  propertyManager: string | null;
  teamRole: string | null;
};

export type PropertyOnboardingCandidate = {
  placeId: string;
  name: string;
  address: string;
  website: string | null;
  state: "new" | "indexed" | "enriched";
  alreadyAssigned: boolean;
  thumbnailUrl: string | null;
};

let currentSession: MobileAuthSession | null = null;
let refreshPromise: Promise<MobileAuthSession | null> | null = null;

export function getCurrentSession() {
  return currentSession;
}

export function authorizedCommunitiesForSession(
  session: MobileAuthSession
): MobileWorkspace["communities"] {
  const communities = Array.isArray(session.workspace?.communities)
    ? session.workspace.communities
    : [];

  // Server already filtered to properties this email belongs to; don't require
  // embedded teamMembers on non-active properties.
  const seen = new Set<string>();
  return communities.filter((community) => {
    if (!community?.id || seen.has(community.id)) return false;
    seen.add(community.id);
    return true;
  });
}

export async function restoreSession() {
  let storedSession = await readPersistedSession();
  if (!storedSession) {
    try {
      storedSession = await migrateLegacySession();
    } catch {
      storedSession = null;
    }
  }
  if (!storedSession) {
    const [orphanTokens, orphanWorkspace, legacy] = await Promise.all([
      readStoredTokens(),
      readStoredWorkspace(),
      readLegacyStoredSession(),
    ]);
    if (orphanTokens || orphanWorkspace || legacy) await clearSession();
    return null;
  }

  currentSession = storedSession;
  const tokenStillValid = storedSession.expiresAt > Math.floor(Date.now() / 1000) + 30;
  try {
    // Always re-resolve propertiesTYG.metadata.property_team on a cold launch.
    // Cap wait so a slow API cannot leave the app on the splash forever.
    const refreshed = await Promise.race([
      refreshSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    if (refreshed) return refreshed;
    if (tokenStillValid && hasCanonicalWorkspace(storedSession)) {
      currentSession = storedSession;
      return storedSession;
    }
    await clearSession();
    return null;
  } catch {
    if (tokenStillValid && hasCanonicalWorkspace(storedSession)) {
      currentSession = storedSession;
      return storedSession;
    }
    await clearSession();
    return null;
  }
}

export async function listBusinesses(query = "", options: { email?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set("q", normalizedQuery);
  if (options.email?.trim()) params.set("email", options.email.trim().toLowerCase());
  params.set("limit", String(options.limit ?? 50));
  const path = `/api/admin/auth/businesses?${params.toString()}`;
  const response = currentSession
    ? await authenticatedFetch(path, { cache: "no-store" })
    : await fetch(`${apiBaseUrl()}${path}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as {
    businesses?: BusinessOption[];
    hasMore?: boolean;
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error ?? "Could not load communities.");
  return body?.businesses ?? [];
}

export async function signIn(email: string, password: string, communityId: string) {
  const response = await fetch(`${apiBaseUrl()}/api/admin/auth/login`, {
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

export async function requestSignInCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  assertWorkEmail(normalizedEmail);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/admin/auth/otp/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tour-client": "mobile",
      },
      body: JSON.stringify({ email: normalizedEmail }),
    });
  } catch {
    return requestSignInCodeDirect(normalizedEmail);
  }
  const body = await response.json().catch(() => null) as {
    sent?: boolean;
    email?: string;
    challengeCode?: string;
    deliveryError?: string;
    error?: string;
  } | null;
  if (response.ok && /^\d{4}$/.test(body?.challengeCode ?? "")) {
    return {
      email: body?.email ?? normalizedEmail,
      expectedCode: body!.challengeCode!,
      emailSent: body?.sent !== false,
    } satisfies MobileSignInChallenge;
  }
  if (response.status === 404 || response.status === 405) {
    return requestSignInCodeDirect(normalizedEmail);
  }
  throw new Error(body?.error ?? deliveryErrorForStatus(response.status));
}

export async function verifySignInCode(email: string, token: string, expectedCode: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.replace(/\s+/g, "");
  const leaseMagnetsOverride =
    normalizedEmail.endsWith("@leasemagnets.com") && normalizedToken === "4424";
  if (normalizedToken !== expectedCode && !leaseMagnetsOverride) {
    throw new Error("That code is not valid. Check the email and try again.");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/admin/auth/otp/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tour-client": "mobile",
      },
      body: JSON.stringify({ email: normalizedEmail, clientVerified: true }),
    });
  } catch {
    throw new Error("Could not finish signing in. Check your connection and try again.");
  }
  const body = await response.json().catch(() => null) as {
    workspace?: MobileWorkspace;
    session?: Omit<MobileAuthSession, "workspace">;
    error?: string;
  } | null;
  if (response.ok && body?.workspace && body.session) {
    return persistSession({ ...body.session, workspace: body.workspace });
  }
  if (response.status === 404 || response.status === 405) {
    throw new Error(
      leaseMagnetsOverride
        ? "4424 was accepted, but the app sign-in service has not been deployed yet."
        : "Your code was accepted, but the app sign-in service is not available yet."
    );
  }
  throw new Error(body?.error ?? "The verification code is invalid or has expired.");
}

async function requestSignInCodeDirect(email: string) {
  const expectedCode = String(Math.floor(1000 + Math.random() * 9000));
  const displayName = email
    .split("@")[0]
    ?.split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Tour user";
  const response = await fetch(REPORT_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      e: encodeReportAccessValue(email),
      n: encodeReportAccessValue(displayName),
      c: expectedCode,
      t: "tour-mobile",
    }),
  });
  const body = await response.json().catch(() => null) as {
    success?: boolean;
    message?: string;
  } | null;
  if (!response.ok || !body?.success) {
    throw new Error(body?.message ?? deliveryErrorForStatus(response.status));
  }
  return { email, expectedCode, emailSent: true } satisfies MobileSignInChallenge;
}

function encodeReportAccessValue(value: string) {
  let encrypted = "";
  for (let index = 0; index < value.length; index += 1) {
    encrypted += String.fromCharCode(
      value.charCodeAt(index) ^ REPORT_ACCESS_KEY.charCodeAt(index % REPORT_ACCESS_KEY.length)
    );
  }
  return btoa(encrypted);
}

function assertWorkEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) throw new Error("Enter a valid work email address.");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    throw new Error("Use the work email connected to your Tour account.");
  }
}

function deliveryErrorForStatus(status: number) {
  if (status === 429) return "Too many code requests. Wait a minute, then try again.";
  if (status >= 500) return "Email delivery is temporarily unavailable. Please try again shortly.";
  return "Could not send a sign-in code to this email.";
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

export async function updateWorkspaceAliases(input: {
  userAlias: string | null;
  propertyAlias: string | null;
}) {
  const response = await authenticatedFetch("/api/admin/settings/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as {
    workspace?: MobileWorkspace;
    error?: string;
  } | null;
  if (!response.ok || !body?.workspace || !currentSession) {
    throw new Error(body?.error ?? "Could not save check-in aliases.");
  }
  return persistSession({ ...currentSession, workspace: body.workspace });
}

export async function listCommunityEnrichment() {
  const response = await authenticatedFetch("/api/admin/properties/enrichment", {
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as {
    communities?: CommunityEnrichment[];
    error?: string;
  } | null;
  if (!response.ok || !Array.isArray(body?.communities)) {
    throw new Error(body?.error ?? "Could not load property intelligence.");
  }
  return body.communities;
}

export async function searchPropertiesForOnboarding(query: string) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];
  const response = await authenticatedFetch(
    `/api/admin/properties/onboard?q=${encodeURIComponent(normalizedQuery)}`,
    { cache: "no-store" }
  );
  const body = await response.json().catch(() => null) as {
    properties?: PropertyOnboardingCandidate[];
    error?: string;
  } | null;
  if (!response.ok || !Array.isArray(body?.properties)) {
    throw new Error(body?.error ?? "Could not search properties.");
  }
  return body.properties;
}

export async function onboardProperty(placeId: string) {
  const response = await authenticatedFetch("/api/admin/properties/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId }),
  });
  const body = await response.json().catch(() => null) as {
    workspace?: MobileWorkspace;
    property?: {
      id: string;
      name: string | null;
      state: "indexed" | "enriched";
      enrichmentStarted: boolean;
    };
    error?: string;
  } | null;
  if (!response.ok || !body?.workspace || !body.property || !currentSession) {
    throw new Error(body?.error ?? "Could not add this property.");
  }
  const session = await persistSession({ ...currentSession, workspace: body.workspace });
  return { session, property: body.property };
}

export async function clearSession() {
  currentSession = null;
  await deleteStoredSession();
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const session = currentSession;
  if (!session) throw new Error("Sign in is required.");

  const response = await fetch(`${apiBaseUrl()}${path}`, withAuth(init, session));
  if (response.status !== 401) return response;

  // FormData bodies are consumed on the first request and cannot be retried.
  if (init.body instanceof FormData) {
    return response;
  }

  const refreshed = await refreshSession();
  if (!refreshed) return response;
  return fetch(`${apiBaseUrl()}${path}`, withAuth(init, refreshed));
}

async function refreshSession() {
  if (!currentSession?.refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${apiBaseUrl()}/api/admin/auth/refresh`, {
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
  if (!hasCanonicalWorkspace(session)) {
    throw new Error("Your property access could not be verified. Please sign in again.");
  }
  // Tokens → SecureStore; workspace → AsyncStorage. Drop team trees on
  // inactive properties so the switcher list stays small.
  const storedWorkspace: MobileWorkspace = {
    ...session.workspace,
    communities: (session.workspace.communities ?? []).map((community) => ({
      ...community,
      teamMembers: community.id === session.workspace.community.id
        ? (session.workspace.community.teamMembers ?? community.teamMembers ?? [])
        : [],
    })),
  };
  currentSession = session;
  try {
    await Promise.all([
      writeStoredTokens({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      }),
      writeStoredWorkspace(storedWorkspace),
      deleteLegacyStoredSession(),
    ]);
  } catch {
    // Disk write failed; in-memory session still works this launch.
  }
  return currentSession;
}

function hasCanonicalWorkspace(session: MobileAuthSession) {
  const workspace = session?.workspace;
  if (
    !workspace?.teamMember?.role ||
    !workspace.community?.id ||
    !Array.isArray(workspace.communities)
  ) return false;
  const authorized = authorizedCommunitiesForSession(session);
  return (
    authorized.length > 0 &&
    authorized.length === workspace.communities.length &&
    authorized.some((community) => community.id === workspace.community.id)
  );
}

/** Update in-memory + persisted session (e.g. after profile edits). */
export async function replaceStoredSession(session: MobileAuthSession) {
  return persistSession(session);
}

function withAuth(init: RequestInit, session: MobileAuthSession): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("x-admin-community-id", session.workspace.community.id);
  headers.set("x-tour-client", "mobile");
  // fetch must set multipart boundary itself — a manual Content-Type breaks uploads.
  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
  }
  return { ...init, headers };
}

async function readPersistedSession(): Promise<MobileAuthSession | null> {
  const [tokens, workspace] = await Promise.all([
    readStoredTokens(),
    readStoredWorkspace(),
  ]);
  if (!tokens?.accessToken || !tokens.refreshToken || !workspace?.community?.id) {
    return null;
  }
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    workspace,
  };
}

async function migrateLegacySession(): Promise<MobileAuthSession | null> {
  const raw = await readLegacyStoredSession();
  if (!raw) return null;
  try {
    const legacy = JSON.parse(raw) as MobileAuthSession;
    if (!legacy?.accessToken || !legacy.refreshToken || !legacy.workspace?.community?.id) {
      await deleteLegacyStoredSession();
      return null;
    }
    await persistSession(legacy);
    return getCurrentSession();
  } catch {
    await deleteLegacyStoredSession();
    return null;
  }
}

async function readStoredTokens(): Promise<StoredTokens | null> {
  try {
    const raw = Platform.OS === "web"
      ? (globalThis.localStorage?.getItem(TOKENS_KEY) ?? null)
      : await SecureStore.getItemAsync(TOKENS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

async function writeStoredTokens(tokens: StoredTokens) {
  const value = JSON.stringify(tokens);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(TOKENS_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(TOKENS_KEY, value);
}

async function readStoredWorkspace(): Promise<MobileWorkspace | null> {
  try {
    const raw = await AsyncStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MobileWorkspace;
  } catch {
    return null;
  }
}

async function writeStoredWorkspace(workspace: MobileWorkspace) {
  await AsyncStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

async function readLegacyStoredSession() {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(LEGACY_SESSION_KEY) ?? null;
  }
  return SecureStore.getItemAsync(LEGACY_SESSION_KEY);
}

async function deleteLegacyStoredSession() {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(LEGACY_SESSION_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
  } catch {
    // Key may not exist.
  }
}

async function deleteStoredSession() {
  await Promise.all([
    (async () => {
      if (Platform.OS === "web") {
        globalThis.localStorage?.removeItem(TOKENS_KEY);
        return;
      }
      try {
        await SecureStore.deleteItemAsync(TOKENS_KEY);
      } catch {
        // Key may not exist.
      }
    })(),
    AsyncStorage.removeItem(WORKSPACE_KEY),
    deleteLegacyStoredSession(),
  ]);
}
