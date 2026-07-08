import "server-only";

import { start } from "workflow/api";

import { resolveRubricForReanalysis } from "./reanalyze-session";
import { getSessionById } from "./sessions";
import { reanalyzeSessionWorkflow } from "@/workflows/reanalyze-session";

export async function startReanalyzeSessionWorkflow(
  sessionId: string,
  options?: { rubricId?: string; resegment?: boolean },
) {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const rubric = await resolveRubricForReanalysis(session, options?.rubricId);
  const resegment = Boolean(options?.resegment);

  const run = await start(reanalyzeSessionWorkflow, [sessionId, rubric.id, resegment]);
  return { runId: run.runId, rubricId: rubric.id, resegment };
}
