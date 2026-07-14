import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { isExpoGo } from "@/runtime";

/**
 * Silently check/fetch OTA updates outside __DEV__ and Expo Go.
 * Reloads when a new update is ready.
 */
export function useEasUpdateCheck() {
  useEffect(() => {
    if (__DEV__ || isExpoGo()) return;

    let cancelled = false;

    async function check() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (cancelled || !fetched.isNew) return;
        await Updates.reloadAsync();
      } catch {
        // Best-effort; offline or misconfigured updates should not block launch.
      }
    }

    void check();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") void check();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
}
