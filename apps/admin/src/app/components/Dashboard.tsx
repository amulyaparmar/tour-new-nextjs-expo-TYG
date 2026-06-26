import { useState } from "react";
import {
  Search, Star, TrendingUp, TrendingDown, Calendar, Upload,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle, Award,
  Play, Filter, X, Settings,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useAdminData } from "../data/AdminDataContext";

type SortKey = "prospect" | "property" | "agent" | "date" | "duration" | "score";
type SortDir = "asc" | "desc";

function ScorePill({ score }: { score: number | null }) {
  if (score === null)
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Processing…</span>;
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />;
  return dir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
}

const SCORE_BANDS = ["0–59", "60–69", "70–79", "80–89", "90–100"];
const DATE_FILTERS = ["All time", "Today", "This week", "This month"] as const;
type DateFilter = typeof DATE_FILTERS[number];

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

export function Dashboard({
  onSelectSession,
  onNavigate,
}: {
  onSelectSession: (id: string) => void;
  onNavigate: (view: string) => void;
}) {
  const { sessions, agents, trendData, properties, refresh } = useAdminData();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All time");
  const [statusFilter, setStatusFilter] = useState<"all" | "scored" | "processing">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProspect, setUploadProspect] = useState("");
  const [uploadAgentId, setUploadAgentId] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

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
  const needsReview = sessions.filter(s => s.score !== null && (s.score ?? 100) < 70).length;

  const cols: { key: SortKey; label: string }[] = [
    { key: "prospect", label: "Prospect" },
    { key: "property", label: "Property" },
    { key: "agent", label: "Agent" },
    { key: "date", label: "Date" },
    { key: "duration", label: "Duration" },
    { key: "score", label: "Score" },
  ];

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-border shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground">Upload recording</h3>
              <button onClick={() => setShowUpload(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <label className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-3 mb-4 hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-foreground font-medium">Drop audio or video file here</p>
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
              <span className="text-muted-foreground text-sm font-normal">admin</span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {[
                { label: "Dashboard", view: "dashboard" },
                { label: "Sessions", view: "sessions" },
                { label: "Analytics", view: "analytics" },
                { label: "Prospects", view: "prospects" },
                { label: "Team", view: "team" },
                { label: "Rubrics", view: "rubrics" },
              ].map(({ label, view }) => (
                <button
                  key={view}
                  onClick={() => view !== "dashboard" && onNavigate(view)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === "dashboard" ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <select className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option>All properties</option>
              {properties.map(p => <option key={p.id}>{p.name}</option>)}
            </select>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
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
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Review tour sessions and track agent performance across your portfolio.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-8">
          {/* Left: sessions */}
          <div>
            {/* Stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Team avg score", value: `${avgScore}`, sub: "+4 vs last month", up: true },
                { label: "Tours this week", value: "6", sub: "4 agents active", up: true },
                { label: "Conversion rate", value: "38%", sub: "↑ 5% vs last month", up: true },
                { label: "Needs review", value: `${needsReview}`, sub: "Score < 70, no notes", up: false, alert: true },
              ].map(({ label, value, sub, up, alert }) => (
                <div key={label} className={`rounded-2xl border p-4 ${alert ? "border-red-200 bg-red-50" : "border-border bg-card"}`}>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">{label}</div>
                  <div className={`text-2xl font-black tracking-tight ${alert ? "text-red-600" : "text-foreground"}`}>{value}</div>
                  <div className={`text-xs mt-1 font-medium ${alert ? "text-red-500" : up ? "text-emerald-600" : "text-muted-foreground"}`}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search prospect, agent, property…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="all">All agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="all">All properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
                {(["all", "scored", "processing"] as const).map(f => (
                  <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${statusFilter === f ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {cols.map(col => (
                      <th key={col.key} className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                        <button className="flex items-center gap-1.5 hover:text-foreground transition-colors" onClick={() => handleSort(col.key)}>
                          {col.label}
                          <SortIcon col={col.key} active={sortKey === col.key} dir={sortDir} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {filtered.map(session => (
                    <tr key={session.id} onClick={() => onSelectSession(session.id)} className="hover:bg-secondary/40 cursor-pointer transition-colors group">
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
                      <td className="px-4 py-3 text-muted-foreground">{session.property}</td>
                      <td className="px-4 py-3 text-muted-foreground">{session.agent}</td>
                      <td className="px-4 py-3 text-muted-foreground">{session.date}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{session.duration}</td>
                      <td className="px-4 py-3"><ScorePill score={session.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-16 text-center text-muted-foreground text-sm">No sessions match your filters.</div>
              )}
            </div>
          </div>

          {/* Right: analytics sidebar */}
          <div className="space-y-5">
            {/* Score trend */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-foreground">Score trend</h3>
                <span className="text-xs text-muted-foreground">6 weeks</span>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7" }} />
                  <Line type="monotone" dataKey="avg" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#4f46e5" }} name="Team avg" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Rubric radar */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Rubric breakdown</h3>
                <span className="text-xs text-muted-foreground">Team avg</span>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <RadarChart data={[
                  { axis: "Opening", score: 84 }, { axis: "Discovery", score: 75 },
                  { axis: "Showcase", score: 80 }, { axis: "Objections", score: 72 },
                  { axis: "Closing", score: 77 }, { axis: "Follow-up", score: 76 },
                ]} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
                  <PolarGrid stroke="#e4e4e7" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "#71717a" }} />
                  <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Leaderboard */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Agent leaderboard</h3>
              </div>
              <div className="space-y-3">
                {[...agents].sort((a, b) => b.avgScore - a.avgScore).map((agent, i) => (
                  <button key={agent.id} onClick={() => onNavigate("team")} className="w-full flex items-center gap-3 hover:bg-secondary/50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                      {agent.name.split(" ")[0]?.[0] ?? "A"}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-foreground">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.toursThisMonth} tours</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{agent.avgScore}</span>
                      {agent.trend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
