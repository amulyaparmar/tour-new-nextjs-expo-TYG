import { redirect } from "next/navigation";
import Link from "next/link";
import { createMaterial, listMaterials } from "@/lib/materials";
import type { Material } from "@/lib/materials";

export default async function MaterialsPage() {
  const materials = await listMaterials();
  const rubrics = materials.filter((m) => m.type === "rubric");
  const training = materials.filter((m) => m.type === "training");
  const other = materials.filter((m) => m.type === "other");

  return (
    <>
      <div className="page-header">
        <h1>Materials</h1>
        <p>Rubrics, training docs, and sales resources</p>
      </div>

      {/* ── Add material form ── */}
      <details className="card" style={{ marginBottom: 16 }}>
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none" }}>
          <h2>+ Add Material</h2>
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

      {/* ── Rubrics ── */}
      {rubrics.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--slate-700)", marginBottom: 8 }}>Rubrics</h2>
          <div className="materials-grid" style={{ marginBottom: 16 }}>
            {rubrics.map((m) => <MaterialCard key={m.id} material={m} />)}
          </div>
        </>
      )}

      {/* ── Training ── */}
      {training.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--slate-700)", marginBottom: 8 }}>Training</h2>
          <div className="materials-grid" style={{ marginBottom: 16 }}>
            {training.map((m) => <MaterialCard key={m.id} material={m} />)}
          </div>
        </>
      )}

      {/* ── Other ── */}
      {other.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--slate-700)", marginBottom: 8 }}>Other</h2>
          <div className="materials-grid">
            {other.map((m) => <MaterialCard key={m.id} material={m} />)}
          </div>
        </>
      )}

      {materials.length === 0 && (
        <div className="empty-state">No materials yet. Add a rubric or training doc above.</div>
      )}
    </>
  );
}

function MaterialCard({ material }: { material: Material }) {
  const icons: Record<string, string> = { rubric: "📋", training: "📖", other: "📎" };

  return (
    <Link href={`/materials/${material.id}`} className="material-card">
      <div className={`material-card-icon ${material.type}`}>
        {icons[material.type] ?? "📎"}
      </div>
      <div className="material-card-info">
        <div className="material-card-name">{material.name}</div>
        <div className="material-card-meta">
          {material.type} · {new Date(material.createdAt).toLocaleDateString()}
        </div>
        {material.description && (
          <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 2 }}>
            {material.description.length > 80 ? material.description.slice(0, 80) + "…" : material.description}
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

  const type = (formData.get("type") as "rubric" | "training" | "other") ?? "other";
  const description = String(formData.get("description") ?? "").trim();

  await createMaterial({ name, type, description });
  redirect("/materials");
}
