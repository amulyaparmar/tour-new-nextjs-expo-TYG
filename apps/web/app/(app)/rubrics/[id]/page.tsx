import { RubricsDashboard } from "../RubricsDashboard";
import { loadRubricDetailPageData } from "../load-rubrics-page-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RubricDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { workspace, rubrics, sessionCounts } = await loadRubricDetailPageData(id);

  return (
    <RubricsDashboard
      rubrics={rubrics}
      communityId={workspace.community.id}
      communityName={workspace.community.name}
      sessionCounts={sessionCounts}
      selectedRubricId={id}
    />
  );
}
