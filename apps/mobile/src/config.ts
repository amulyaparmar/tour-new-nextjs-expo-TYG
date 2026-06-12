import Constants from "expo-constants";

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (raw && !raw.includes("localhost")) {
    return raw.replace(/\/+$/, "");
  }

  // On a physical device, localhost is unreachable.
  // Expo's debuggerHost gives us the dev machine's LAN IP (e.g. "192.168.1.5:8081").
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? (Constants as any).manifest?.debuggerHost;

  if (debuggerHost) {
    const lanIp = debuggerHost.split(":")[0];
    if (lanIp && lanIp !== "localhost" && lanIp !== "127.0.0.1") {
      return `http://${lanIp}:3000`;
    }
  }

  return "http://localhost:3000";
}
