import { Suspense } from "react";

import { NewSessionFlow } from "./NewSessionFlow";

export default function NewSessionPage() {
  return (
    <Suspense fallback={null}>
      <NewSessionFlow />
    </Suspense>
  );
}
