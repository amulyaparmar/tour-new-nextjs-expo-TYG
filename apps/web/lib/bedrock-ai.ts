import "server-only";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

export function getBedrockModel() {
  const region = process.env.AWS_REGION || "us-east-1";
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    throw new Error("BEDROCK_MODEL_ID is not configured");
  }

  const bedrock = createAmazonBedrock({
    region,
    apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
  });

  return bedrock(modelId);
}
