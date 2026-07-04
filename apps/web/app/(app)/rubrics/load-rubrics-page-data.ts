import { notFound } from "next/navigation";

import { listRubricsForCommunity } from "@/lib/rubrics";
import { listSessions } from "@/lib/sessions";
import { requireTourWorkspace } from "@/lib/tour-auth";

export async function loadRubricsPageData() {
  const workspace = await requireTourWorkspace();
  const [rubrics, sessions] = await Promise.all([
    listRubricsForCommunity(workspace.community.id),
    listSessions({ limit: 200, sort: "newest", propertyId: workspace.community.id }),
  ]);

  const sessionCounts = sessions.reduce<Record<string, number>>((counts, session) => {
    if (!session.rubricId) return counts;
    counts[session.rubricId] = (counts[session.rubricId] ?? 0) + 1;
    return counts;
  }, {});

  return {
    workspace,
    rubrics,
    sessionCounts,
  };
}

export async function loadRubricDetailPageData(rubricId: string) {
  const data = await loadRubricsPageData();
  const rubric = data.rubrics.find((item) => item.id === rubricId);
  if (!rubric) notFound();
  return { ...data, rubricId };
}
