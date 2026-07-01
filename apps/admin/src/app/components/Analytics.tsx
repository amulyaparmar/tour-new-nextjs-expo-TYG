import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { Play, TrendingUp, ArrowRight, Settings } from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";

const AGENT_COLORS: Record<string, string> = {
  "Sarah K.": "#4f46e5",
  "Marcus T.": "#06b6d4",
  "James R.": "#f59e0b",
  "Priya S.": "#10b981",
};

const RUBRIC_CATS = ["Opening", "Discovery", "Showcase", "Objections", "Closing", "Follow-up"];

function cellColor(score: number) {
  if (score >= 85) return "bg-emerald-100 text-emerald-800";
  if (score >= 70) return "bg-blue-50 text-blue-700";
  if (score >= 60) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

export function Analytics({ onNavigate, onSelectSession }: {
  onNavigate: (view: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const { sessions, agents, trendData, scoreDistribution, funnelData, properties } = useAdminData();
  const initialParams = new URLSearchParams(window.location.search);
  const [agentLines, setAgentLines] = useState<Record<string, boolean>>({
    "Sarah K.": true, "Marcus T.": true, "James R.": true, "Priya S.": true,
  });
  const [propertyFilter, setPropertyFilter] = useState(initialParams.get("property") ?? "all");
  const [dateFilter, setDateFilter] = useState(initialParams.get("range") ?? "This month");

  const toggleAgent = (name: string) => setAgentLines(prev => ({ ...prev, [name]: !prev[name] }));
  useEffect(() => {
    const params = new URLSearchParams();
    if (propertyFilter !== "all") params.set("property", propertyFilter);
    if (dateFilter !== "This month") params.set("range", dateFilter);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [dateFilter, propertyFilter]);

  const topSessions = [...sessions].filter(s => s.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const bottomSessions = [...sessions].filter(s => s.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5);
  const scoredSessions = sessions.filter((session) => session.score !== null);
  const avgScore = scoredSessions.length
    ? Math.round(scoredSessions.reduce((sum, session) => sum + (session.score ?? 0), 0) / scoredSessions.length)
    : 0;
  const highScore = scoredSessions.reduce((max, session) => Math.max(max, session.score ?? 0), 0);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
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
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === "analytics" ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="all">All properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              {["Today", "This week", "This month", "Last 3 months"].map(d => <option key={d}>{d}</option>)}
            </select>
            <button onClick={() => onNavigate("settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Performance trends, score distributions, and rubric breakdowns across your team.</p>
        </div>

        {/* Summary stat strip */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "Sessions analyzed", value: `${sessions.length}` },
            { label: "Team avg score", value: `${avgScore}` },
            { label: "Highest score", value: `${highScore}` },
            { label: "Conversion rate", value: `${sessions.length ? Math.round((funnelData[2]?.value ?? 0) / sessions.length * 100) : 0}%` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{label}</div>
              <div className="text-3xl font-black tracking-tight text-foreground">{value}</div>
            </div>
          ))}
        </div>

        {/* Row 1: Score distribution + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 mb-5">
          {/* Score distribution */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-sm text-foreground">Score distribution</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Tours by score band</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Tours">
                  {scoreDistribution.map((entry, i) => {
                    const colors = ["#fca5a5", "#fcd34d", "#93c5fd", "#6ee7b7", "#a5b4fc"];
                    return <Cell key={i} fill={colors[i] ?? "#a5b4fc"} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Score trend */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Score trend</h3>
                <p className="text-xs text-muted-foreground mt-0.5">6-week rolling average by agent</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => toggleAgent(a.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${agentLines[a.name] ? "border-transparent text-white" : "border-border text-muted-foreground bg-white"}`}
                    style={agentLines[a.name] ? { background: AGENT_COLORS[a.name] } : {}}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis domain={[55, 100]} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
                <Line type="monotone" dataKey="avg" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Team avg" />
                {agents.map(a => agentLines[a.name] && (
                  <Line key={a.id} type="monotone" dataKey={a.name} stroke={AGENT_COLORS[a.name]} strokeWidth={2} dot={{ r: 3, fill: AGENT_COLORS[a.name] }} name={a.name} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2: Heatmap + Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 mb-5">
          {/* Rubric category heatmap */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-sm text-foreground">Rubric category breakdown</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Average score per agent per rubric category</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-28">Agent</th>
                    {RUBRIC_CATS.map(cat => (
                      <th key={cat} className="text-center py-2 px-2 font-semibold text-muted-foreground">{cat}</th>
                    ))}
                    <th className="text-center py-2 px-2 font-semibold text-muted-foreground">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agents.map(agent => (
                    <tr key={agent.id}>
                      <td className="py-2 pr-4 font-semibold text-foreground">{agent.name}</td>
                      {agent.rubricBreakdown.map(rb => (
                        <td key={rb.axis} className="py-1.5 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-semibold ${cellColor(rb.score)}`}>{rb.score}</span>
                        </td>
                      ))}
                      <td className="py-1.5 px-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-md font-bold ${cellColor(agent.avgScore)}`}>{agent.avgScore}</span>
                      </td>
                    </tr>
                  ))}
                  {/* Team avg row */}
                  <tr className="bg-secondary/30">
                    <td className="py-2 pr-4 font-bold text-muted-foreground">Team avg</td>
                    {RUBRIC_CATS.map((cat, i) => {
                      const avg = Math.round(agents.reduce((sum, a) => sum + (a.rubricBreakdown[i]?.score ?? 0), 0) / agents.length);
                      return (
                        <td key={cat} className="py-1.5 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-semibold ${cellColor(avg)}`}>{avg}</span>
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-md font-bold ${cellColor(avgScore)}`}>{avgScore}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Conversion funnel */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-sm text-foreground">Conversion funnel</h3>
              <p className="text-xs text-muted-foreground mt-0.5">This month</p>
            </div>
            <div className="space-y-3">
              {funnelData.map((item, i) => {
                const pct = Math.round((item.value / (funnelData[0]?.value ?? item.value)) * 100);
                const colors = ["bg-primary", "bg-blue-400", "bg-emerald-500"];
                return (
                  <div key={item.stage}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{item.stage}</span>
                      <span className="text-xs font-bold text-foreground">{item.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-7 bg-secondary rounded-xl overflow-hidden">
                      <div className={`h-full ${colors[i] ?? "bg-primary"} rounded-xl transition-all flex items-center px-3`} style={{ width: `${pct}%` }}>
                        <span className="text-xs font-semibold text-white">{pct}%</span>
                      </div>
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="flex justify-end mt-1">
                        <span className="text-xs text-muted-foreground">
                          {Math.round(((funnelData[i + 1]?.value ?? 0) / item.value) * 100)}% conversion →
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 3: Top & Bottom sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[
            { title: "Top performing sessions", sessions: topSessions, positive: true },
            { title: "Lowest performing sessions", sessions: bottomSessions, positive: false },
          ].map(({ title, sessions: list, positive }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className={`w-4 h-4 ${positive ? "text-emerald-500" : "text-red-500"} ${positive ? "" : "rotate-180"}`} />
                <h3 className="font-semibold text-sm text-foreground">{title}</h3>
              </div>
              <div className="space-y-2">
                {list.map(session => (
                  <button key={session.id} onClick={() => onSelectSession(session.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/50 transition-colors group text-left">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                      {session.prospect.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{session.prospect}</div>
                      <div className="text-xs text-muted-foreground">{session.agent} · {session.property}</div>
                    </div>
                    <ScorePill score={session.score} />
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
