import Constants from "expo-constants";

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? (Constants as any).manifest?.debuggerHost;

  if (raw) {
    const configuredUrl = raw.replace(/\/+$/, "");
    try {
      const url = new URL(configuredUrl);
      const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!isLocalHost) {
        return configuredUrl;
      }

      // On a physical device, localhost is unreachable. Expo's host URI gives
      // us the dev machine's LAN IP while preserving the configured API port.
      if (debuggerHost) {
        const lanIp = debuggerHost.split(":")[0];
        if (lanIp && lanIp !== "localhost" && lanIp !== "127.0.0.1") {
          url.hostname = lanIp;
          return url.toString().replace(/\/+$/, "");
        }
      }

      return configuredUrl;
    } catch {
      return configuredUrl;
    }
  }

  if (debuggerHost) {
    const lanIp = debuggerHost.split(":")[0];
    if (lanIp && lanIp !== "localhost" && lanIp !== "127.0.0.1") {
      return `http://${lanIp}:3000`;
    }
  }

  return "http://localhost:3000";
}
