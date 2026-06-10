export const tourWorkspace = {
  name: "Tour Hub",
  description: "Manage tour knowledge, recordings, sales materials, media, and follow-up work.",
  supabaseProjectId: "tkweddqlriikqgylsuxz"
} as const;

export const tourMetrics = [
  { label: "Tour recordings", shortLabel: "Recordings", value: "42" },
  { label: "Knowledge articles", shortLabel: "Articles", value: "128" },
  { label: "Sales materials", shortLabel: "Materials", value: "31" },
  { label: "Follow-ups due", shortLabel: "Tasks", value: "9" }
] as const;

export const recentRecordings = [
  "Downtown leasing walkthrough",
  "Student housing renewal tour",
  "Corporate relocation visit"
] as const;
