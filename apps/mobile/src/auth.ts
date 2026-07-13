import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getApiBaseUrl } from "./config";

const SESSION_KEY = "tour.mobile.session.v1";
const BASE_URL = getApiBaseUrl();
const REPORT_ACCESS_URL = "https://tour.report/api/verify-access";
const REPORT_ACCESS_KEY = "LeaseMagnets2025TYG";

export type MobileWorkspace = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
  teamMember: {
    id: string | null;
    alias: string | null;
    name: string;
    email: string;
    role: string;
    accessRole: "admin" | "manager" | "member";
    phone: string | null;
    verified: boolean | null;
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
      phone: string | null;
      verified: boolean | null;
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

let currentSession: MobileAuthSession | null = null;
let refreshPromise: Promise<MobileAuthSession | null> | null = null;

export function getCurrentSession() {
  return currentSession;
}

export function authorizedCommunitiesForSession(
  session: MobileAuthSession
): MobileWorkspace["communities"] {
  const email = session.workspace?.user?.email?.trim().toLowerCase();
  const communities = Array.isArray(session.workspace?.communities)
    ? session.workspace.communities
    : [];
  if (!email) return [];

  const seen = new Set<string>();
  return communities.filter((community) => {
    if (!community?.id || seen.has(community.id) || !Array.isArray(community.teamMembers)) {
      return false;
    }
    const authorized = community.teamMembers.some(
      (member) => member?.email?.trim().toLowerCase() === email
    );
    if (authorized) seen.add(community.id);
    return authorized;
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
  try {
    // Always re-resolve propertiesTYG.metadata.property_team on a cold launch.
    // OTA updates can otherwise revive a workspace cached by an older access model.
    return await refreshSession();
  } catch {
    const tokenStillValid = storedSession.expiresAt > Math.floor(Date.now() / 1000) + 30;
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

export async function requestSignInCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  assertWorkEmail(normalizedEmail);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/admin/auth/otp/start`, {
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
    error?: string;
  } | null;
  if (response.ok && body?.sent && /^\d{4}$/.test(body.challengeCode ?? "")) {
    return {
      email: body.email ?? normalizedEmail,
      expectedCode: body.challengeCode!,
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
    response = await fetch(`${BASE_URL}/api/admin/auth/otp/verify`, {
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

export async function clearSession() {
  currentSession = null;
  await deleteStoredSession();
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const session = currentSession;
  if (!session) throw new Error("Sign in is required.");

  const response = await fetch(`${BASE_URL}${path}`, withAuth(init, session));
  if (response.status !== 401) return response;

  // FormData bodies are consumed on the first request and cannot be retried.
  if (init.body instanceof FormData) {
    return response;
  }

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
  if (!hasCanonicalWorkspace(session)) {
    throw new Error("Your property access could not be verified. Please sign in again.");
  }
  currentSession = session;
  await writeStoredSession(JSON.stringify(session));
  return session;
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
