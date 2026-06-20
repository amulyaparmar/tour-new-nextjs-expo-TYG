export type RubricQuestion = {
  id: string;
  question: string;
  maxPoints: number;
  guidance?: string;
};

export type RubricSection = {
  id: string;
  name: string;
  maxPoints: number;
  questions: RubricQuestion[];
};

export type RubricDefinition = {
  sections: RubricSection[];
  /** Compliance / fair-housing style questions — flagged, not scored */
  complianceQuestions?: RubricQuestion[];
  scoringInstructions?: string;
};

export type RubricSummary = {
  id: string;
  name: string;
  description: string | null;
  totalPoints: number;
  isDefault: boolean;
  sectionCount: number;
  questionCount: number;
  createdAt: string;
};

export type Rubric = RubricSummary & {
  sourceFileUrl: string | null;
  sourceFileName: string | null;
  templateText: string | null;
  definition: RubricDefinition;
  updatedAt: string;
};

export type CreateRubricInput = {
  name: string;
  description?: string | null;
  sourceFileUrl?: string | null;
  sourceFileName?: string | null;
  templateText?: string | null;
  definition: RubricDefinition;
  isDefault?: boolean;
};
