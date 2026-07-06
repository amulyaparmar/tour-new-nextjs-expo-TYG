import "server-only";

import {
  isAnalysisModelId,
  resolveProviderModelId,
  type AnalysisModelId,
  type AiProvider
} from "@tour/shared";

import { getBedrockRuntimeConfig, invokeClaudeTool, type ClaudeMessage, type ClaudeTool } from "./bedrock";
import { invokeOpenAiTool } from "./bedrock-openai";

export function resolveAnalysisModelConfig(analysisModel?: AnalysisModelId | null): {
  provider: AiProvider;
  modelId: string;
} {
  if (analysisModel && isAnalysisModelId(analysisModel)) {
    return resolveProviderModelId(analysisModel);
  }

  return {
    provider: "bedrock",
    modelId: getBedrockRuntimeConfig().modelId
  };
}

/** Route structured tool calls to the correct analysis provider. */
export async function invokeAnalysisTool<T = Record<string, unknown>>(params: {
  analysisModel?: AnalysisModelId | null;
  system?: string;
  messages: ClaudeMessage[];
  tool: ClaudeTool;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const { provider, modelId } = resolveAnalysisModelConfig(params.analysisModel);

  if (provider === "bedrock-openai") {
    return invokeOpenAiTool<T>({
      system: params.system,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
      })),
      tool: params.tool,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      modelId
    });
  }

  return invokeClaudeTool<T>({
    system: params.system,
    messages: params.messages,
    tool: params.tool,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    modelId
  });
}
