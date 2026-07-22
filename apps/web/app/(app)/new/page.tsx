import { Suspense } from "react";

import { requireTourWorkspace } from "@/lib/tour-auth";
import { NewSessionFlow } from "./NewSessionFlow";

export default async function NewSessionPage() {
  const workspace = await requireTourWorkspace();

  return (
    <Suspense fallback={null}>
      <NewSessionFlow
        propertyLocation={workspace.community.name}
        profileName={workspace.user.fullName ?? workspace.teamMember.name ?? workspace.user.email}
      />
    </Suspense>
  );
}
