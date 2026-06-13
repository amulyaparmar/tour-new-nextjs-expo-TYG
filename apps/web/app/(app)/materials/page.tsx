import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, BookOpen, Mic, Paperclip, Plus } from "lucide-react";
import { createMaterial, listMaterials } from "@/lib/materials";
import type { Material, MaterialType } from "@/lib/materials";

export const dynamic = "force-dynamic";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rubric: <ClipboardList size={20} />,
  training: <BookOpen size={20} />,
  recording: <Mic size={20} />,
  other: <Paperclip size={20} />
};

export default async function MaterialsPage() {
  const materials = await listMaterials();
  const recordings = materials.filter((m) => m.type === "recording");
  const rubrics = materials.filter((m) => m.type === "rubric");
  const training = materials.filter((m) => m.type === "training");
  const other = materials.filter((m) => m.type === "other");

  return (
    <>
      <div className="page-header">
        <h1>Materials</h1>
        <p>Rubrics, recordings, training docs, and sales resources</p>
      </div>

      <details className="card" style={{ marginBottom: 16 }}>
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} />
          <h2>Add Material</h2>
        </summary>
        <div className="card-body">
          <form action={createMaterialAction} className="form-grid">
            <div className="form-group">
              <label htmlFor="name" className="form-label">Name</label>
              <input id="name" name="name" type="text" className="form-input" placeholder="Closing Playbook" required />
            </div>
            <div className="form-group">
              <label htmlFor="type" className="form-label">Type</label>
              <select id="type" name="type" className="form-select" defaultValue="rubric">
                <option value="rubric">Rubric</option>
                <option value="training">Training</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="description" className="form-label">Description</label>
              <textarea id="description" name="description" rows={3} className="form-textarea" placeholder="What this material covers..." />
            </div>
            <button type="submit" className="btn btn-primary">Add Material</button>
          </form>
        </div>
      </details>

      {recordings.length > 0 && (
        <MaterialSection title="Recordings" materials={recordings} />
      )}
      {rubrics.length > 0 && (
        <MaterialSection title="Rubrics" materials={rubrics} />
      )}
      {training.length > 0 && (
        <MaterialSection title="Training" materials={training} />
      )}
      {other.length > 0 && (
        <MaterialSection title="Other" materials={other} />
      )}

      {materials.length === 0 && (
        <div className="empty-state">No materials yet. Add a rubric or training doc above, or record a session to see it here.</div>
      )}
    </>
  );
}

function MaterialSection({ title, materials }: { title: string; materials: Material[] }) {
  return (
    <>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--slate-700)", marginBottom: 8 }}>{title}</h2>
      <div className="materials-grid" style={{ marginBottom: 16 }}>
        {materials.map((m) => <MaterialCard key={m.id} material={m} />)}
      </div>
    </>
  );
}

function MaterialCard({ material }: { material: Material }) {
  const href = material.type === "recording" && material.sessionId
    ? `/sessions/${material.sessionId}`
    : `/materials/${material.id}`;

  return (
    <Link href={href} className="material-card">
      <div className={`material-card-icon ${material.type}`}>
        {TYPE_ICONS[material.type] ?? <Paperclip size={20} />}
      </div>
      <div className="material-card-info">
        <div className="material-card-name">{material.name}</div>
        <div className="material-card-meta">
          {material.type} &middot; {new Date(material.createdAt).toLocaleDateString()}
        </div>
        {material.description && (
          <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 2 }}>
            {material.description.length > 80 ? material.description.slice(0, 80) + "\u2026" : material.description}
          </div>
        )}
        {material.type === "recording" && material.sessionId && (
          <div style={{ fontSize: 11, color: "var(--indigo-500)", marginTop: 3, fontWeight: 500 }}>
            View session &rarr;
          </div>
        )}
      </div>
    </Link>
  );
}

async function createMaterialAction(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const type = (formData.get("type") as MaterialType) ?? "other";
  const description = String(formData.get("description") ?? "").trim();

  await createMaterial({ name, type, description });
  redirect("/materials");
}
