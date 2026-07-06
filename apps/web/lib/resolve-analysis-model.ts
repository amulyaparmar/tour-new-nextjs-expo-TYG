import "server-only";

import {
  ANALYSIS_MODELS,
  DEFAULT_ANALYSIS_MODEL,
  type AnalysisModelId
} from "@tour/shared";

/** Pick a standardized id that matches BEDROCK_MODEL_ID or BEDROCK_OPENAI_MODEL when possible. */
export function defaultAnalysisModelId(): AnalysisModelId {
  for (const envModel of [process.env.BEDROCK_MODEL_ID, process.env.BEDROCK_OPENAI_MODEL]) {
    if (!envModel) continue;
    for (const model of ANALYSIS_MODELS) {
      if (model.providerModelId === envModel) return model.id;
    }
  }
  return DEFAULT_ANALYSIS_MODEL;
}
