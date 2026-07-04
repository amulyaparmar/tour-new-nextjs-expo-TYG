import type { Rubric, RubricDefinition } from "@tour/shared";

export type RubricStatus = "active" | "draft";

export type RubricItem = {
  id: string;
  text: string;
  points: number;
  note: string;
};

export type RubricCategory = {
  name: string;
  description: string;
  weight: number;
  criteria: RubricItem[];
};

export type ExtractedDefinition = RubricDefinition;

export type DisplayRubricCategory = {
  name: string;
  weight: number;
  description: string;
  criteria: string[];
  items?: RubricItem[];
};

export type DisplayRubric = Rubric & {
  version: string;
  status: RubricStatus;
  propertyIds: string[];
  sessionCount: number;
  lastUpdated: string;
  categories: DisplayRubricCategory[];
};

export function createRubricItem(text = "", points = 1, note = "", id?: string): RubricItem {
  const random = id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id: random, text, points, note };
}

export function categoriesTotalPoints(categories: RubricCategory[]): number {
  return categories.reduce(
    (sum, category) => sum + category.criteria.reduce((sectionSum, item) => sectionSum + (Number(item.points) || 0), 0),
    0
  );
}

export function definitionToCategories(definition: ExtractedDefinition): RubricCategory[] {
  return definition.sections.map((section) => {
    const sectionPoints = section.items.reduce((sum, item) => sum + (item.points || 0), 0);
    const description = section.items.find((item) => item.note)?.note ?? definition.notes ?? "";
    return {
      name: section.name,
      description,
      weight: sectionPoints,
      criteria: section.items.map((item) => createRubricItem(item.text, item.points || 1, item.note ?? description, item.id)),
    };
  });
}

export function editableRubricCategory(category: DisplayRubricCategory): RubricCategory {
  const fallbackPoints = Math.max(1, Math.round(category.weight / Math.max(category.criteria.length, 1)));
  const items = category.items?.length
    ? category.items
    : category.criteria.map((criterion, index) => ({
      id: `${category.name}-${index + 1}`,
      text: criterion,
      points: fallbackPoints,
      note: category.description,
    }));

  return {
    name: category.name,
    description: category.description,
    weight: category.weight,
    criteria: items.map((item) => ({
      id: item.id,
      text: item.text,
      points: item.points,
      note: item.note ?? category.description,
    })),
  };
}

export function mapRubricToDisplay(
  rubric: Rubric,
  communityId: string,
  sessionCount = 0
): DisplayRubric {
  return {
    ...rubric,
    version: "v1",
    status: rubric.isDefault ? "active" : "draft",
    propertyIds: [communityId],
    sessionCount,
    lastUpdated: new Date(rubric.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    categories: rubric.definition.sections.map((section) => ({
      name: section.name,
      weight: section.items.reduce((sum, item) => sum + item.points, 0),
      description: section.items[0]?.note ?? rubric.definition.notes ?? "",
      criteria: section.items.map((item) => item.text),
      items: section.items.map((item) => ({
        id: item.id,
        text: item.text,
        points: item.points,
        note: item.note ?? "",
      })),
    })),
  };
}
