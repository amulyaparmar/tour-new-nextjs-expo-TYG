import Link from "next/link";
import { BookOpen, ClipboardList, ExternalLink, Link2, Paperclip, Play, Plus, Video } from "lucide-react";
import { listVisibleMaterials } from "@/lib/materials";
import type { Material } from "@/lib/materials";

import { AddMaterialForm } from "./AddMaterialForm";

export const dynamic = "force-dynamic";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rubric: <ClipboardList size={20} />,
  training: <BookOpen size={20} />,
  recording: <Video size={20} />,
  other: <Paperclip size={20} />
};

export default async function MaterialsPage() {
  const materials = await listVisibleMaterials();
  const tourAssets = materials.filter((m) => m.media);
  const rubrics = materials.filter((m) => m.type === "rubric");
  const training = materials.filter((m) => m.type === "training");
  const other = materials.filter((m) => m.type === "other" && !m.media);

  return (
    <>
      <div className="page-header">
        <h1>Materials</h1>
        <p>Rubrics, training docs, Tour.video assets, and sales resources</p>
        <Link href="/rubrics" style={{ fontSize: 13, fontWeight: 600, color: "var(--indigo-600)", marginTop: 4, display: "inline-block" }}>
          Manage evaluation rubrics →
        </Link>
      </div>

      <details className="card" style={{ marginBottom: 16 }} open>
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} />
          <h2>Add Material or Rubric</h2>
        </summary>
        <div className="card-body">
          <AddMaterialForm />
        </div>
      </details>

      {tourAssets.length > 0 && (
        <MaterialSection title="Tour Videos & Links" materials={tourAssets} />
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
        <div className="empty-state">No materials yet. Add a rubric or training doc above.</div>
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
      {material.media?.imageUrl ? (
        <img src={material.media.imageUrl} alt="" className="material-card-thumb" />
      ) : (
        <div className={`material-card-icon ${material.type}`}>
          {material.media ? <Video size={20} /> : TYPE_ICONS[material.type] ?? <Paperclip size={20} />}
        </div>
      )}
      <div className="material-card-info">
        <div className="material-card-name">{material.name}</div>
        <div className="material-card-meta">
          {material.media ? "Tour.video asset" : material.type} &middot; {new Date(material.createdAt).toLocaleDateString()}
        </div>
        {material.description && (
          <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 2 }}>
            {material.description.length > 80 ? material.description.slice(0, 80) + "\u2026" : material.description}
          </div>
        )}
        {material.media && (
          <div className="material-card-badges">
            {material.media.videoUrl && (
              <span><Play size={11} /> Video</span>
            )}
            {material.media.iframeUrl && (
              <span><Link2 size={11} /> Embed link</span>
            )}
            <span><ExternalLink size={11} /> Open</span>
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
