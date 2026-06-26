import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play, TrendingUp, TrendingDown, X, MessageSquare, ArrowRight, Star, Settings,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import { type AdminAgent, useAdminData } from "../data/AdminDataContext";

type Agent = AdminAgent;

function ScorePill({ score }: { score: number }) {
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

function AgentProfilePanel({ agent, onClose, onSelectSession }: {
  agent: Agent;
  onClose: () => void;
  onSelectSession: (id: string) => void;
}) {
  const { sessions, teamRadar } = useAdminData();
  const trendSeries = agent.weeklyScores.map((score, i) => ({ week: WEEKS[i], score, team: teamRadar.reduce((a, r) => a + r.score, 0) / teamRadar.length }));
  const agentSessions = sessions.filter(s => s.agentId === agent.id).slice(0, 5);
  const combinedRadar = agent.rubricBreakdown.map((r, i) => ({ ...r, team: teamRadar[i]?.score ?? 0 }));

  return (
    <motion.div
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-full w-[380px] bg-white border-l border-border shadow-2xl z-40 flex flex-col overflow-y-auto"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground text-base">
            {agent.full.split(" ").map(n => n[0]).join("")}
          </div>
          <div>
            <div className="font-bold text-foreground">{agent.full}</div>
            <div className="text-xs text-muted-foreground">{agent.role}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Avg score", value: agent.avgScore, color: agent.avgScore >= 85 ? "text-emerald-600" : agent.avgScore >= 70 ? "text-blue-600" : "text-red-500" },
            { label: "Tours / mo", value: agent.toursThisMonth, color: "text-foreground" },
            { label: "Coaching notes", value: agent.coachingCount, color: "text-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border p-3 text-center">
              <div className={`text-xl font-black ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Score trend */}
        <div>
          <h4 className="font-semibold text-sm text-foreground mb-3">Score trend — 8 weeks</h4>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={trendSeries} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#4f46e5" }} name={agent.name} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Radar vs team */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm text-foreground">Rubric vs team avg</h4>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-primary" />{agent.name}</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-300" />Team</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <RadarChart data={combinedRadar} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
              <PolarGrid stroke="#e4e4e7" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "#71717a" }} />
              <Radar dataKey="team" stroke="#cbd5e1" fill="#cbd5e1" fillOpacity={0.3} strokeWidth={1.5} name="Team avg" />
              <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} strokeWidth={2} name={agent.name} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent sessions */}
        <div>
          <h4 className="font-semibold text-sm text-foreground mb-3">Recent sessions</h4>
          <div className="space-y-2">
            {agentSessions.length === 0 && <p className="text-xs text-muted-foreground">No sessions yet.</p>}
            {agentSessions.map(s => (
              <button key={s.id} onClick={() => onSelectSession(s.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group text-left">
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                  {s.prospect.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{s.prospect}</div>
                  <div className="text-xs text-muted-foreground">{s.date}</div>
                </div>
                {s.score !== null ? <ScorePill score={s.score} /> : <span className="text-xs text-muted-foreground italic">Processing</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Team({ onNavigate, onSelectSession }: {
  onNavigate: (view: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const { agents, teamRadar } = useAdminData();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      <AnimatePresence>
        {selectedAgent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
              onClick={() => setSelectedAgent(null)} />
            <AgentProfilePanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} onSelectSession={(id) => { setSelectedAgent(null); onSelectSession(id); }} />
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
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === "team" ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
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
        <div className="mb-8">
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Team</h1>
          <p className="text-muted-foreground text-sm mt-1">View individual agent performance, trends, and coaching coverage.</p>
        </div>

        {/* Agent cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-bold text-foreground text-base">
                  {agent.full.split(" ").map(n => n[0]).join("")}
                </div>
                {agent.trend === "up"
                  ? <div className="flex items-center gap-1 text-xs font-medium text-emerald-600"><TrendingUp className="w-3.5 h-3.5" /> Trending up</div>
                  : <div className="flex items-center gap-1 text-xs font-medium text-red-500"><TrendingDown className="w-3.5 h-3.5" /> Trending down</div>
                }
              </div>
              <div className="font-bold text-foreground">{agent.full}</div>
              <div className="text-xs text-muted-foreground mb-4">{agent.role}</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Avg score</div>
                  <div className={`text-xl font-black ${agent.avgScore >= 85 ? "text-emerald-600" : agent.avgScore >= 70 ? "text-blue-600" : "text-red-500"}`}>
                    {agent.avgScore}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Tours / mo</div>
                  <div className="text-xl font-black text-foreground">{agent.toursThisMonth}</div>
                </div>
              </div>

              {/* Mini trend sparkline */}
              <div className="mt-4 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={agent.weeklyScores.map((score, i) => ({ w: i, score }))}>
                    <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {agent.coachingCount} coaching notes
                </div>
                <ArrowRight className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </div>

        {/* Team overview comparison */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Team rubric comparison</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Average score per rubric category, all agents</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-center">
            <div className="space-y-3">
              {teamRadar.map(cat => {
                const agentScores = agents.map(a => ({ name: a.name, score: a.rubricBreakdown.find(r => r.axis === cat.axis)?.score ?? 0 }));
                const min = Math.min(...agentScores.map(a => a.score));
                const max = Math.max(...agentScores.map(a => a.score));
                return (
                  <div key={cat.axis}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{cat.axis}</span>
                      <span className="text-muted-foreground">Range: {min}–{max}</span>
                    </div>
                    <div className="flex items-center gap-1 h-6">
                      {agentScores.map(a => (
                        <div key={a.name} className="relative flex-1 h-full bg-secondary rounded overflow-hidden" title={`${a.name}: ${a.score}`}>
                          <div className="h-full bg-primary/70 rounded" style={{ width: `${a.score}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {agentScores.map(a => (
                        <div key={a.name} className="flex-1 text-center text-xs text-muted-foreground">{a.score}</div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-1 mt-2 pt-2 border-t border-border">
                {agents.map(a => (
                  <div key={a.id} className="flex-1 text-center text-xs font-semibold text-muted-foreground">{a.name}</div>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={teamRadar} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="#e4e4e7" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "#71717a" }} />
                <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} strokeWidth={2} name="Team avg" />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
