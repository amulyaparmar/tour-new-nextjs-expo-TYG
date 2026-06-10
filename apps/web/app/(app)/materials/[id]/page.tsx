import Link from "next/link";
import { ClipboardList, BookOpen, Mic, Paperclip, ArrowRight } from "lucide-react";
import { getMaterial } from "@/lib/materials";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rubric: <ClipboardList size={22} />,
  training: <BookOpen size={22} />,
  recording: <Mic size={22} />,
  other: <Paperclip size={22} />
};

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

  return (
    <>
      <Link href="/materials" className="back-link">← Back to Materials</Link>

      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "var(--indigo-500)" }}>{TYPE_ICONS[material.type] ?? <Paperclip size={22} />}</span>
        <div>
          <h1>{material.name}</h1>
          <p>{material.type} &middot; Added {new Date(material.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {material.description && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h2>Description</h2></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--slate-600)" }}>{material.description}</p>
          </div>
        </div>
      )}

      {material.type === "recording" && material.sessionId && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h2>Session</h2></div>
          <div className="card-body">
            <Link href={`/sessions/${material.sessionId}`} className="btn btn-primary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              View Full Session & Analysis <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {material.parsedText && (
        <div className="card">
          <div className="card-header">
            <h2>{material.type === "recording" ? "Transcript Preview" : "Content"}</h2>
          </div>
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
