import Link from "next/link";
import { getMaterial } from "@/lib/materials";

type Props = { params: Promise<{ id: string }> };

export default async function MaterialDetailPage({ params }: Props) {
  const { id } = await params;
  const material = await getMaterial(id);

  if (!material) {
    return (
      <>
        <Link href="/materials" className="back-link">← Materials</Link>
        <h1 style={{ fontSize: 20 }}>Material not found</h1>
      </>
    );
  }

  const icons: Record<string, string> = { rubric: "📋", training: "📖", other: "📎" };

  return (
    <>
      <Link href="/materials" className="back-link">← Back to Materials</Link>

      <div className="page-header">
        <h1>{icons[material.type] ?? "📎"} {material.name}</h1>
        <p>{material.type} · Added {new Date(material.createdAt).toLocaleDateString()}</p>
      </div>

      {material.description && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h2>Description</h2></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--slate-600)" }}>{material.description}</p>
          </div>
        </div>
      )}

      {material.parsedText && (
        <div className="card">
          <div className="card-header"><h2>Content</h2></div>
          <div className="card-body">
            <pre style={{ fontSize: 13, color: "var(--slate-700)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {material.parsedText}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
