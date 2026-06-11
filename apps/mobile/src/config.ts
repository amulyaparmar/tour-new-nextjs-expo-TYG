export function getApiBaseUrl() {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }

  // iOS simulator uses localhost — port 3000 matches the Next.js dev server
  return "http://localhost:3000";
}
