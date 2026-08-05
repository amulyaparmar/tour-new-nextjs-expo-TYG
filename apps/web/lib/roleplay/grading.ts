import {
  EvaluationItem,
  RoleplayScenario,
  RoleplayStructuredData,
  RubricKey,
} from "./types";

export const DEFAULT_ROLEPLAY_PASS_THRESHOLD = 70;
export const MISSED_LINKED_CHECKPOINT_SCORE_CAP = 12;
export const GRADING_POLICY_VERSION = "roleplay-v2";

export type RoleplayGradeStatus = "passed" | "not-passed" | "needs-review";

export type CheckpointGradeResult = {
  id: string;
  name: string;
  description?: string;
  required: boolean;
  rubricKey?: RubricKey;
  hit: boolean | null;
  // Verbatim grader quote from the hit moment, and the call time it resolves
  // to (attached by feedbackTimestamps.resolveCheckpointTimes at save time).
  evidenceQuote?: string;
  timeSeconds?: number;
};

export type CategoryGradeResult = {
  key: RubricKey;
  label: string;
  description: string;
  score: number | null;
  rawScore: number | null;
  cappedByCheckpoint?: string;
};

export type CanonicalRoleplayGrade = {
  policyVersion: string;
  status: RoleplayGradeStatus;
  passed: boolean;
  score: number | null;
  passThreshold: number;
  categories: CategoryGradeResult[];
  checkpoints: CheckpointGradeResult[];
  missedRequired: CheckpointGradeResult[];
  incompleteFields: string[];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const roleplayPassThreshold = (scenario?: Partial<RoleplayScenario> | null) => {
  const configured = finiteNumber(scenario?.passThreshold);
  return configured === null ? DEFAULT_ROLEPLAY_PASS_THRESHOLD : clamp(Math.round(configured), 0, 100);
};

export type ScoreBand = "strong" | "pass" | "near" | "fail";

// Score color band relative to the attempt's pass threshold: a passing score
// must never render in a warning color, whatever threshold the scenario set.
export const scoreBand = (
  score: number | null | undefined,
  passThreshold: number = DEFAULT_ROLEPLAY_PASS_THRESHOLD
): ScoreBand => {
  const value = finiteNumber(score);
  if (value === null) return "near";
  if (value >= passThreshold + 10) return "strong";
  if (value >= passThreshold) return "pass";
  if (value >= passThreshold - 10) return "near";
  return "fail";
};

// Band for a full grade: outcome wins over the number (a 90 that missed a
// required checkpoint is still not-passed and renders as a fail).
export const gradeScoreBand = (grade: CanonicalRoleplayGrade): ScoreBand => {
  if (grade.status === "needs-review") return "near";
  if (grade.status === "not-passed") return "fail";
  return scoreBand(grade.score, grade.passThreshold);
};

export function computeRoleplayGrade(
  scenario: RoleplayScenario,
  structuredData: RoleplayStructuredData
): CanonicalRoleplayGrade {
  const passThreshold = roleplayPassThreshold(scenario);
  const incompleteFields: string[] = [];

  const checkpoints: CheckpointGradeResult[] = (scenario.checkpoints ?? []).map((checkpoint) => {
    const raw = structuredData.checkpoints?.[checkpoint.id];
    const hit = typeof raw === "boolean" ? raw : null;
    const required = checkpoint.required !== false;
    if (required && hit === null) incompleteFields.push(`checkpoint:${checkpoint.id}`);
    const evidenceRaw = structuredData.checkpointEvidence?.[checkpoint.id];
    const evidenceQuote =
      hit === true && typeof evidenceRaw === "string" && evidenceRaw.trim()
        ? evidenceRaw.trim()
        : undefined;
    return {
      id: checkpoint.id,
      name: checkpoint.name,
      description: checkpoint.description,
      required,
      rubricKey: checkpoint.rubricKey,
      hit,
      ...(evidenceQuote ? { evidenceQuote } : {}),
    };
  });

  const categories: CategoryGradeResult[] = (scenario.rubric ?? []).map((category) => {
    const raw = finiteNumber(structuredData.categoryScores?.[category.key]);
    if (raw === null) {
      incompleteFields.push(`category:${category.key}`);
      return {
        key: category.key,
        label: category.label,
        description: category.description,
        score: null,
        rawScore: null,
      };
    }

    const normalized = Math.round(clamp(raw, 0, 20));
    const missedLinkedCheckpoint = checkpoints.find(
      (checkpoint) =>
        checkpoint.required && checkpoint.hit === false && checkpoint.rubricKey === category.key
    );
    const score = missedLinkedCheckpoint
      ? Math.min(normalized, MISSED_LINKED_CHECKPOINT_SCORE_CAP)
      : normalized;

    return {
      key: category.key,
      label: category.label,
      description: category.description,
      score,
      rawScore: normalized,
      cappedByCheckpoint:
        missedLinkedCheckpoint && normalized > MISSED_LINKED_CHECKPOINT_SCORE_CAP
          ? missedLinkedCheckpoint.name
          : undefined,
    };
  });

  if (categories.length === 0) incompleteFields.push("rubric");
  const score =
    incompleteFields.some((field) => field === "rubric" || field.startsWith("category:"))
      ? null
      : Math.round(
          (100 * categories.reduce((sum, category) => sum + (category.score ?? 0), 0)) /
            (20 * categories.length)
        );
  const missedRequired = checkpoints.filter(
    (checkpoint) => checkpoint.required && checkpoint.hit === false
  );
  const status: RoleplayGradeStatus =
    incompleteFields.length > 0
      ? "needs-review"
      : (score ?? 0) >= passThreshold && missedRequired.length === 0
      ? "passed"
      : "not-passed";

  return {
    policyVersion: GRADING_POLICY_VERSION,
    status,
    passed: status === "passed",
    score,
    passThreshold,
    categories,
    checkpoints,
    missedRequired,
    incompleteFields,
  };
}

export function checkpointResultsFromEvaluation(
  checkpointEvaluation?: EvaluationItem
): CheckpointGradeResult[] {
  const stored = checkpointEvaluation?.details?.results;
  if (Array.isArray(stored)) {
    return stored.map((result: any, index: number) => ({
      id: String(result?.id || `checkpoint-${index + 1}`),
      name: String(result?.name || `Checkpoint ${index + 1}`),
      description: typeof result?.description === "string" ? result.description : undefined,
      required: result?.required !== false,
      rubricKey: result?.rubricKey,
      hit: typeof result?.hit === "boolean" ? result.hit : null,
      ...(typeof result?.evidenceQuote === "string" && result.evidenceQuote.trim()
        ? { evidenceQuote: result.evidenceQuote.trim() }
        : {}),
      ...(Number.isFinite(Number(result?.timeSeconds))
        ? { timeSeconds: Number(result.timeSeconds) }
        : {}),
    }));
  }

  return (checkpointEvaluation?.comments ?? []).map((comment, index) => {
    const hit = /^HIT\b/.test(comment) ? true : /^MISSED\b/.test(comment) ? false : null;
    const content = comment.replace(/^(HIT|MISSED|UNKNOWN)\s+—\s+/, "");
    const colonIndex = content.indexOf(":");
    return {
      id: `legacy-checkpoint-${index + 1}`,
      name: (colonIndex >= 0 ? content.slice(0, colonIndex) : content).trim(),
      description: colonIndex >= 0 ? content.slice(colonIndex + 1).trim() : undefined,
      required: true,
      hit,
    };
  });
}

export function gradeFromStoredEvaluations(
  scoreValue: unknown,
  evaluations: EvaluationItem[]
): CanonicalRoleplayGrade {
  const policy = evaluations.find((evaluation) => evaluation.keyword === "roleplay_grading_policy");
  const details = policy?.details;
  if (
    details &&
    details.policyVersion === GRADING_POLICY_VERSION &&
    ["passed", "not-passed", "needs-review"].includes(details.status)
  ) {
    return {
      policyVersion: details.policyVersion,
      status: details.status,
      passed: details.status === "passed",
      score: finiteNumber(details.score),
      passThreshold: finiteNumber(details.passThreshold) ?? DEFAULT_ROLEPLAY_PASS_THRESHOLD,
      categories: Array.isArray(details.categories) ? details.categories : [],
      checkpoints: Array.isArray(details.checkpoints) ? details.checkpoints : [],
      missedRequired: Array.isArray(details.missedRequired) ? details.missedRequired : [],
      incompleteFields: Array.isArray(details.incompleteFields) ? details.incompleteFields : [],
    };
  }

  const score = finiteNumber(scoreValue);
  const checkpointEvaluation = evaluations.find(
    (evaluation) => evaluation.keyword === "checkpoints_hit"
  );
  const checkpoints = checkpointResultsFromEvaluation(checkpointEvaluation);
  const incompleteFields = checkpoints
    .filter((checkpoint) => checkpoint.required && checkpoint.hit === null)
    .map((checkpoint) => `checkpoint:${checkpoint.id}`);
  const missedRequired = checkpoints.filter(
    (checkpoint) => checkpoint.required && checkpoint.hit === false
  );
  const status: RoleplayGradeStatus =
    score === null || incompleteFields.length > 0
      ? "needs-review"
      : score >= DEFAULT_ROLEPLAY_PASS_THRESHOLD && missedRequired.length === 0
      ? "passed"
      : "not-passed";

  return {
    policyVersion: "legacy-default-required-checkpoints",
    status,
    passed: status === "passed",
    score,
    passThreshold: DEFAULT_ROLEPLAY_PASS_THRESHOLD,
    categories: [],
    checkpoints,
    missedRequired,
    incompleteFields,
  };
}

export function gradeExplanation(grade: CanonicalRoleplayGrade): string {
  if (grade.status === "needs-review") {
    return "Some grading fields were incomplete, so this attempt needs review.";
  }

  if (grade.passed) {
    return `Met the ${grade.passThreshold}-point threshold and every required checkpoint.`;
  }

  const score = grade.score ?? 0;
  const belowThreshold = score < grade.passThreshold;
  const missedNames = grade.missedRequired.map((checkpoint) => checkpoint.name).join(", ");

  if (!belowThreshold && grade.missedRequired.length > 0) {
    const checkpointLabel =
      grade.missedRequired.length === 1
        ? "Failed checkpoint"
        : "Failed checkpoints";
    return `${checkpointLabel}: ${missedNames}.`;
  }

  if (belowThreshold && grade.missedRequired.length > 0) {
    const checkpointLabel =
      grade.missedRequired.length === 1
        ? "a required checkpoint was also missed"
        : "required checkpoints were also missed";
    return `This attempt did not pass: the score was ${score}/${grade.passThreshold} required, and ${checkpointLabel}: ${missedNames}.`;
  }

  if (belowThreshold) {
    return `This attempt did not pass: ${grade.passThreshold - score} more score points were needed (${score}/${grade.passThreshold}).`;
  }

  return "The passing requirements were not met.";
}
