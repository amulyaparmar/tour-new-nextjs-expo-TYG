export function getApiBaseUrl() {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }

  // iOS simulator localhost fallback
  return "http://localhost:3002";
}
