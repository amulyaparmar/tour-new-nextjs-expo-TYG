import { useEffect, useState } from "react";
import {
  Search, Play, ChevronUp, ChevronDown, ChevronsUpDown,
  Upload, Settings, Building2, CheckCircle2, Clock,
} from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";

type SortKey = "prospect" | "property" | "agent" | "date" | "duration" | "score";
type SortDir = "asc" | "desc";

function ScorePill({ score }: { score: number | null }) {
  if (score === null)
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Processing…</span>;
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/40" />;
  return dir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
}

const NAV = [
  { label: "Dashboard", view: "dashboard" },
  { label: "Sessions", view: "sessions" },
  { label: "Analytics", view: "analytics" },
  { label: "Prospects", view: "prospects" },
  { label: "Team", view: "team" },
  { label: "Rubrics", view: "rubrics" },
];

const COLS: { key: SortKey; label: string }[] = [
  { key: "prospect", label: "Prospect" },
  { key: "property", label: "Property" },
  { key: "agent", label: "Agent" },
  { key: "date", label: "Date" },
  { key: "duration", label: "Duration" },
  { key: "score", label: "Score" },
];

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

export function Sessions({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: (view: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const { sessions, agents, properties, refresh } = useAdminData();
  const initialParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(initialParams.get("q") ?? "");
  const [agentFilter, setAgentFilter] = useState(initialParams.get("agent") ?? "all");
  const [propertyFilter, setPropertyFilter] = useState(initialParams.get("property") ?? "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "scored" | "processing">((initialParams.get("status") as "all" | "scored" | "processing" | null) ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>((initialParams.get("sort") as SortKey | null) ?? "date");
  const [sortDir, setSortDir] = useState<SortDir>((initialParams.get("dir") as SortDir | null) ?? "desc");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProspect, setUploadProspect] = useState("");
  const [uploadAgentId, setUploadAgentId] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (agentFilter !== "all") params.set("agent", agentFilter);
    if (propertyFilter !== "all") params.set("property", propertyFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortKey !== "date") params.set("sort", sortKey);
    if (sortDir !== "desc") params.set("dir", sortDir);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [agentFilter, propertyFilter, search, sortDir, sortKey, statusFilter]);

  const uploadRecording = async () => {
    if (!uploadFile || !uploadProspect.trim()) return;
    setUploading(true);
    try {
      const agent = agents.find((item) => item.id === uploadAgentId);
      const property = properties.find((item) => item.id === agent?.propertyId) ?? properties[0];
      const createResponse = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${property?.name ?? "Property"} tour - ${uploadProspect}`,
          prospectName: uploadProspect,
          scheduledAt: new Date().toISOString(),
          agentId: uploadAgentId || null,
          propertyId: property?.id ?? null,
          location: property?.name ?? null,
        }),
      });
      if (!createResponse.ok) throw new Error("Could not create session");
      const { session } = await createResponse.json();
      const form = new FormData();
      form.append("file", uploadFile);
      await fetch(apiUrl(`/api/sessions/${session.id}/upload`), { method: "POST", body: form });
      void fetch(apiUrl(`/api/sessions/${session.id}/process`), { method: "POST" });
      setShowUpload(false);
      setUploadFile(null);
      setUploadProspect("");
      setUploadAgentId("");
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const filtered = sessions
    .filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !search || s.prospect.toLowerCase().includes(q) || s.property.toLowerCase().includes(q) || s.agent.toLowerCase().includes(q);
      const matchAgent = agentFilter === "all" || s.agentId === agentFilter;
      const matchProperty = propertyFilter === "all" || s.propertyId === propertyFilter;
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchAgent && matchProperty && matchStatus;
    })
    .sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "score") { va = a.score ?? -1; vb = b.score ?? -1; }
      else if (sortKey === "date") { va = a.id; vb = b.id; }
      else { va = (a as any)[sortKey] ?? ""; vb = (b as any)[sortKey] ?? ""; }
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });

  const scored = sessions.filter(s => s.score !== null);
  const avgScore = Math.round(scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-border shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground">Upload recording</h3>
              <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground"><span className="text-lg leading-none">×</span></button>
            </div>
            <label className="block border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-3 mb-4 hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Drop audio or video file here</p>
              <p className="text-xs text-muted-foreground">MP3, MP4, M4A, WAV up to 2 GB</p>
              <input type="file" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
            {uploadFile && <p className="text-xs text-muted-foreground mb-3">{uploadFile.name}</p>}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prospect name</label>
                <input value={uploadProspect} onChange={(event) => setUploadProspect(event.target.value)} placeholder="e.g. Jordan Mitchell" className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agent</label>
                <select value={uploadAgentId} onChange={(event) => setUploadAgentId(event.target.value)} className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Select agent…</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.full}</option>)}
                </select>
              </div>
            </div>
            <button onClick={uploadRecording} disabled={!uploadFile || !uploadProspect.trim() || uploading} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all">
              {uploading ? "Uploading…" : "Upload & analyze"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Play className="w-3 h-3 fill-white text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">Tour</span>
              <span className="text-muted-foreground text-sm">admin</span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map(({ label, view }) => (
                <button key={view} onClick={() => onNavigate(view)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === "sessions" ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" />
              Upload recording
            </button>
            <button onClick={() => onNavigate("settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Sessions</h1>
          <p className="text-muted-foreground text-sm mt-1">Every recorded tour across your portfolio, with AI scores and full transcripts.</p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total sessions", value: `${sessions.length}` },
            { label: "Scored", value: `${scored.length}` },
            { label: "Team avg score", value: `${avgScore}` },
            { label: "Processing", value: `${sessions.filter(s => s.status === "processing").length}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{label}</div>
              <div className="text-2xl font-black tracking-tight text-foreground">{value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search prospect, agent, property…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="all">All properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
            {(["all", "scored", "processing"] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === f ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {COLS.map(col => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => handleSort(col.key)}>
                      {col.label}
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    </button>
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rubric</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {filtered.map(session => (
                <tr key={session.id} onClick={() => onSelectSession(session.id)}
                  className="hover:bg-secondary/40 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                        {session.prospect.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{session.prospect}</div>
                        <div className="text-xs text-muted-foreground">{session.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{session.property}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{session.agent}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{session.date}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{session.duration}</td>
                  <td className="px-4 py-3"><ScorePill score={session.score} /></td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">Standard v2</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {session.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">{tag}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">No sessions match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}
