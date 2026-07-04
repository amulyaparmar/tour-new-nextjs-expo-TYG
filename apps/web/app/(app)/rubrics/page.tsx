import { RubricsDashboard } from "./RubricsDashboard";
import { loadRubricsPageData } from "./load-rubrics-page-data";

export const dynamic = "force-dynamic";

export default async function RubricsPage() {
  const { workspace, rubrics, sessionCounts } = await loadRubricsPageData();

  return (
    <RubricsDashboard
      rubrics={rubrics}
      communityId={workspace.community.id}
      communityName={workspace.community.name}
      sessionCounts={sessionCounts}
    />
  );
}
