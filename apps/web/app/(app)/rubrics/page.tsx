import { ClipboardList } from "lucide-react";

import { listRubrics } from "@/lib/rubrics";

import { RubricList } from "./RubricList";
import { RubricUploadForm } from "./RubricUploadForm";

export const dynamic = "force-dynamic";

export default async function RubricsPage() {
  const rubrics = await listRubrics();

  return (
    <>
      <div className="page-header">
        <h1>Evaluation Rubrics</h1>
        <p>Upload a rubric template to extract scoring criteria, then select a rubric when creating sessions.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ClipboardList size={16} />
          <h2>Upload Rubric Template</h2>
        </div>
        <div className="card-body">
          <RubricUploadForm />
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--slate-700)", marginBottom: 8 }}>
        Available Rubrics
      </h2>
      <RubricList rubrics={rubrics} />
    </>
  );
}
