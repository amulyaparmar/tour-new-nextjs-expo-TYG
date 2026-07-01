import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, X, Play, ChevronRight, Phone, Mail, Calendar,
  MessageSquare, Zap, CheckCircle2, Clock, ArrowUpRight, Settings,
} from "lucide-react";
import { type AdminProspect, useAdminData } from "../data/AdminDataContext";

type Prospect = AdminProspect;
type FollowUpStatus = "pending" | "sent" | "converted" | "lost";

const STATUS_CONFIG: Record<FollowUpStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200" },
  sent: { label: "Sent", color: "bg-blue-50 text-blue-700 border-blue-200" },
  converted: { label: "Converted", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  lost: { label: "Lost", color: "bg-slate-100 text-slate-500 border-slate-200" },
};

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

function StatusBadge({ status }: { status: FollowUpStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>{cfg.label}</span>;
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground italic">Pending</span>;
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

function ProspectPanel({ prospect, onClose, onSelectSession }: {
  prospect: Prospect;
  onClose: () => void;
  onSelectSession: (id: string) => void;
}) {
  const [status, setStatus] = useState<FollowUpStatus>(prospect.followUpStatus);
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState(prospect.notes);

  const persist = async (body: Record<string, unknown>) => {
    await fetch(apiUrl(`/api/admin/prospects/${encodeURIComponent(prospect.id)}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const addNote = () => {
    if (!newNote.trim()) return;
    const note = { text: newNote, timestamp: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), author: "Manager - You" };
    setNotes(prev => [...prev, note]);
    setNewNote("");
    void persist({ status, note });
  };

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-full w-[420px] bg-white border-l border-border shadow-2xl z-40 flex flex-col overflow-y-auto"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-border px-5 py-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground text-sm">
              {prospect.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <div className="font-bold text-foreground">{prospect.name}</div>
              <div className="text-xs text-muted-foreground">{prospect.property} · {prospect.unit}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {/* Contact */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <a href={`mailto:${prospect.email}`} className="flex items-center gap-1 hover:text-primary transition-colors">
            <Mail className="w-3.5 h-3.5" />{prospect.email}
          </a>
          <a href={`tel:${prospect.phone}`} className="flex items-center gap-1 hover:text-primary transition-colors">
            <Phone className="w-3.5 h-3.5" />{prospect.phone}
          </a>
        </div>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5">
        {/* Status + score */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">Follow-up status</div>
            <select
              value={status}
              onChange={e => {
                const next = e.target.value as FollowUpStatus;
                setStatus(next);
                void persist({ status: next });
              }}
              className="w-full text-xs font-semibold border-none bg-transparent focus:outline-none text-foreground cursor-pointer"
            >
              {(Object.keys(STATUS_CONFIG) as FollowUpStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <div className="mt-1"><StatusBadge status={status} /></div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">Tour score</div>
            <ScorePill score={prospect.score} />
            <div className="text-xs text-muted-foreground mt-1">via {prospect.agent}</div>
          </div>
        </div>

        {/* Key dates */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          {[
            { label: "Tour date", value: prospect.tourDate },
            { label: "Last contact", value: prospect.lastContact },
            { label: "Next follow-up", value: prospect.nextFollowUp ?? "Not set" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${value === "Not set" ? "text-muted-foreground italic" : "text-foreground"}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Tour session link */}
        <button
          onClick={() => onSelectSession(prospect.tourSessionId)}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Play className="w-4 h-4 text-primary fill-primary" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">View tour session</div>
            <div className="text-xs text-muted-foreground">{prospect.tourDate} · {prospect.agent}</div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        {/* AI follow-up actions */}
        {prospect.followUpActions.length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm text-foreground">AI follow-up actions</h4>
            </div>
            <div className="space-y-2">
              {prospect.followUpActions.map((action, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{action}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline + notes */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm text-foreground">Timeline</h4>
          </div>
          <div className="space-y-3 mb-4">
            {/* Tour event */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Play className="w-3 h-3 fill-white text-white" />
                </div>
                <div className="w-px flex-1 bg-border mt-1" />
              </div>
              <div className="pb-3">
                <div className="text-xs font-semibold text-foreground">Tour completed</div>
                <div className="text-xs text-muted-foreground">{prospect.tourDate} · {prospect.agent}</div>
              </div>
            </div>
            {/* Notes */}
            {notes.map((note, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                  </div>
                  {i < notes.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="pb-3">
                  <p className="text-xs text-foreground leading-relaxed">{note.text}</p>
                  <div className="text-xs text-muted-foreground mt-0.5">{note.timestamp} · {note.author}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Add note */}
          <div>
            <textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border bg-input-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            <button onClick={addNote} disabled={!newNote.trim()}
              className="mt-2 w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-all">
              Add note
            </button>
          </div>
        </div>

        {/* Convert / mark lost */}
        {status !== "converted" && status !== "lost" && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={() => { setStatus("converted"); void persist({ status: "converted" }); }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Mark converted
            </button>
            <button onClick={() => { setStatus("lost"); void persist({ status: "lost" }); }} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
              Mark lost
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Prospects({ onNavigate, onSelectSession }: {
  onNavigate: (view: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const { prospects, agents, properties } = useAdminData();
  const initialParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(initialParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | FollowUpStatus>((initialParams.get("status") as "all" | FollowUpStatus | null) ?? "all");
  const [agentFilter, setAgentFilter] = useState(initialParams.get("agent") ?? "all");
  const [propertyFilter, setPropertyFilter] = useState(initialParams.get("property") ?? "all");
  const [selected, setSelected] = useState<Prospect | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (agentFilter !== "all") params.set("agent", agentFilter);
    if (propertyFilter !== "all") params.set("property", propertyFilter);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [agentFilter, propertyFilter, search, statusFilter]);

  const filtered = prospects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.property.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || p.followUpStatus === statusFilter;
    const matchAgent = agentFilter === "all" || p.agentId === agentFilter;
    const matchProperty = propertyFilter === "all" || p.propertyId === propertyFilter;
    return matchSearch && matchStatus && matchAgent && matchProperty;
  });

  const counts = {
    total: prospects.length,
    pending: prospects.filter(p => p.followUpStatus === "pending").length,
    sent: prospects.filter(p => p.followUpStatus === "sent").length,
    converted: prospects.filter(p => p.followUpStatus === "converted").length,
    lost: prospects.filter(p => p.followUpStatus === "lost").length,
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
              onClick={() => setSelected(null)} />
            <ProspectPanel prospect={selected} onClose={() => setSelected(null)}
              onSelectSession={(id) => { setSelected(null); onSelectSession(id); }} />
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Play className="w-3 h-3 fill-white text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight">Tour</span>
            <span className="text-muted-foreground text-sm">admin</span>
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
              <button key={view} onClick={() => onNavigate(view)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === "prospects" ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <button onClick={() => onNavigate("settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Prospects</h1>
          <p className="text-muted-foreground text-sm mt-1">Track every toured prospect, their follow-up status, and AI-recommended next actions.</p>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { key: "pending" as const, label: "Needs follow-up", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
            { key: "sent" as const, label: "Follow-up sent", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
            { key: "converted" as const, label: "Converted", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            { key: "lost" as const, label: "Lost", color: "text-slate-500", bg: "bg-slate-50 border-slate-200" },
          ].map(({ key, label, color, bg }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className={`rounded-2xl border p-4 text-left transition-all ${statusFilter === key ? bg : "border-border bg-card hover:bg-secondary/50"}`}
            >
              <div className={`text-2xl font-black tracking-tight ${statusFilter === key ? color : "text-foreground"}`}>{counts[key]}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or property…"
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
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {["Prospect", "Property", "Unit", "Agent", "Tour date", "Score", "Follow-up status", "Last contact"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {filtered.map(prospect => (
                <tr key={prospect.id} onClick={() => setSelected(prospect)} className="hover:bg-secondary/40 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                        {prospect.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{prospect.name}</div>
                        <div className="text-xs text-muted-foreground">{prospect.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{prospect.property}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{prospect.unit}</td>
                  <td className="px-4 py-3 text-muted-foreground">{prospect.agent}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{prospect.tourDate}</td>
                  <td className="px-4 py-3"><ScorePill score={prospect.score} /></td>
                  <td className="px-4 py-3"><StatusBadge status={prospect.followUpStatus} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{prospect.lastContact}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">No prospects match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}
