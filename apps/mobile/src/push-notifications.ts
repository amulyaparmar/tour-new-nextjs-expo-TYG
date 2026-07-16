import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { authenticatedFetch } from "./auth";
import { isExpoGo } from "./runtime";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type SessionNotificationPayload = {
  sessionId: string;
  autoStartRecording?: boolean;
};

function readSessionPayload(data: unknown): SessionNotificationPayload | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const sessionId = record.sessionId;
  if (typeof sessionId !== "string" || !sessionId) return null;
  return {
    sessionId,
    autoStartRecording: record.autoStartRecording === true || record.autoStartRecording === "true",
  };
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo() || Platform.OS === "web") return null;

  try {
    const permissions = await Notifications.getPermissionsAsync();
    let status = permissions.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || typeof projectId !== "string") return null;

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;
    if (!token) return null;

    await authenticatedFetch("/api/device-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      }),
    });

    return token;
  } catch {
    return null;
  }
}

export function addNotificationResponseListener(
  onSession: (payload: SessionNotificationPayload) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const payload = readSessionPayload(response.notification.request.content.data);
    if (payload) onSession(payload);
  });
  return () => sub.remove();
}

/** Foreground notification — refresh home session lists without requiring a tap. */
export function addNotificationReceivedListener(
  onSession: (payload: SessionNotificationPayload) => void,
): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const payload = readSessionPayload(notification.request.content.data);
    if (payload) onSession(payload);
  });
  return () => sub.remove();
}
