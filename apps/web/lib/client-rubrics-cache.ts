"use client";

import type { Rubric } from "@tour/shared";

const TTL_MS = 60_000;

let cached: { rubrics: Rubric[]; fetchedAt: number } | null = null;
let inflight: Promise<Rubric[]> | null = null;

export function invalidateRubricsCache() {
  cached = null;
  inflight = null;
}

export async function fetchCommunityRubrics(options?: { force?: boolean }): Promise<Rubric[]> {
  if (!options?.force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.rubrics;
  }

  if (!options?.force && inflight) {
    return inflight;
  }

  inflight = fetch("/api/admin/rubrics")
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to load rubrics");
      const data = await res.json() as { rubrics: Rubric[] };
      const rubrics = data.rubrics ?? [];
      cached = { rubrics, fetchedAt: Date.now() };
      return rubrics;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
