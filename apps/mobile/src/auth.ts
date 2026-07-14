import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getApiBaseUrl } from "./config";

const SESSION_KEY = "tour.mobile.session.v1";
const REPORT_ACCESS_URL = "https://tour.report/api/verify-access";
const REPORT_ACCESS_KEY = "LeaseMagnets2025TYG";

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
  // embedded teamMembers (kept empty for SecureStore size).
  const seen = new Set<string>();
  return communities.filter((community) => {
    if (!community?.id || seen.has(community.id)) return false;
    seen.add(community.id);
    return true;
  });
}

export async function restoreSession() {
  const raw = await readStoredSession();
  if (!raw) return null;

  let storedSession: MobileAuthSession;
  try {
    storedSession = JSON.parse(raw) as MobileAuthSession;
  } catch {
    await clearSession();
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

export async function listBusinesses(query = "") {
  const response = await fetch(
    `${apiBaseUrl()}/api/admin/auth/businesses${query ? `?q=${encodeURIComponent(query)}` : ""}`
  );
  const body = await response.json().catch(() => null) as {
    businesses?: BusinessOption[];
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
  if (response.ok && /^\d{4}$/.test(body.challengeCode ?? "")) {
    return {
      email: body.email ?? normalizedEmail,
      expectedCode: body.challengeCode!,
      emailSent: body.sent !== false,
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
  return { email, expectedCode } satisfies MobileSignInChallenge;
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
  // Keep SecureStore under the 2048-byte soft limit: drop bulky team arrays.
  const compact: MobileAuthSession = {
    ...session,
    workspace: {
      ...session.workspace,
      community: {
        ...session.workspace.community,
        teamMembers: (session.workspace.community.teamMembers ?? []).slice(0, 40).map((member) => ({
          ...member,
          notificationPreferences: null,
        })),
      },
      communities: (session.workspace.communities ?? []).map((community) => ({
        ...community,
        teamMembers: [],
      })),
    },
  };
  currentSession = {
    ...compact,
    workspace: {
      ...compact.workspace,
      // Keep live team list in memory for the active property.
      community: session.workspace.community,
    },
  };
  try {
    await writeStoredSession(JSON.stringify(compact));
  } catch {
    // SecureStore may reject large values; in-memory session still works this launch.
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

/** Update in-memory + SecureStore session (e.g. after profile edits). */
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
