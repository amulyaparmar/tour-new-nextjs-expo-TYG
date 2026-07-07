import "server-only";

import type { Rubric } from "@tour/shared";

import { getRubricById, getRubricForSession, listRubricsForCommunity } from "./rubrics";
import { getSessionById } from "./sessions";

export async function resolveRubricForReanalysis(
  session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>,
  rubricId?: string
): Promise<Rubric> {
  if (!rubricId) {
    return getRubricForSession(session.rubricId);
  }

  const rubric = await getRubricById(rubricId);
  if (!rubric) {
    throw new Error("Rubric not found.");
  }

  if (session.propertyId) {
    const allowed = await listRubricsForCommunity(session.propertyId);
    if (allowed.length > 0 && !allowed.some((item) => item.id === rubricId)) {
      throw new Error("Rubric is not assigned to this community.");
    }
  }

  return rubric;
}
