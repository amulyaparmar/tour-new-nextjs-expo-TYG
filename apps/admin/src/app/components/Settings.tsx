import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play, User, Link2, Shield, Bell, ChevronRight, Check,
  AlertCircle, ExternalLink, X, Eye, EyeOff, Zap, RefreshCw,
  CheckCircle2, Clock, Building2, Users, FileText, Settings as SettingsIcon,
} from "lucide-react";
import { useAdminData } from "../data/AdminDataContext";

type SettingsTab = "profile" | "integrations" | "notifications" | "security";
type EntraStatus = "disconnected" | "connecting" | "connected" | "error";
type EntrataStats = {
  guestCardsSynced?: number;
  tourScoresPushed?: number;
  followUpNotesPushed?: number;
  propertiesSynced?: number;
  unitsSynced?: number;
};

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Processing</span>;
  const c = score >= 85 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 70 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{score}</span>;
}

function NavHeader({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
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
              className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto">
          <button className="px-3 py-1.5 rounded-lg text-sm bg-secondary text-foreground font-semibold">Settings</button>
        </div>
      </div>
    </header>
  );
}

/* ─── Entrata connect flow ─── */
function EntrataConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [domain, setDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/api/admin/integrations/entrata/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, apiKey, propertyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Connection test failed");
      const connectResponse = await fetch(apiUrl("/api/admin/integrations/entrata/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, apiKey, propertyId }),
      });
      const connectResult = await connectResponse.json().catch(() => ({}));
      if (!connectResponse.ok) throw new Error(connectResult.error ?? "Connection save failed");
      setStep(3);
      onConnected();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#e8f0fe] flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#1a56db]" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Connect Entrata</div>
              <div className="text-xs text-muted-foreground">Step {step} of 3</div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <p className="text-sm text-muted-foreground mb-5">Enter your Entrata domain and API credentials. You can find these under <span className="font-medium text-foreground">Setup → API Access</span> in Entrata.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Entrata domain</label>
                    <div className="flex rounded-xl overflow-hidden border border-border">
                      <span className="px-3 py-2.5 bg-secondary text-xs text-muted-foreground border-r border-border">https://</span>
                      <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourcompany.entrata.com"
                        className="flex-1 px-3 py-2.5 bg-input-background text-sm focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">API key</label>
                    <div className="relative">
                      <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="ent_live_••••••••••••"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                      <button onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Entrata property ID</label>
                    <input value={propertyId} onChange={e => setPropertyId(e.target.value)} placeholder="e.g. 123456"
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    <p className="text-xs text-muted-foreground mt-1">Found in Entrata under Properties → Property Details.</p>
                  </div>
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <p className="text-sm text-muted-foreground mb-5">Choose which data Tour can read and write in Entrata.</p>
                <div className="space-y-2">
                  {[
                    { label: "Read prospect/guest card records", desc: "Match toured prospects to existing guest cards", enabled: true, locked: true },
                    { label: "Create & update guest cards", desc: "Sync tour sessions and scores back to Entrata", enabled: true, locked: false },
                    { label: "Read unit availability", desc: "Surface live availability in the prospects view", enabled: true, locked: false },
                    { label: "Write lease notes", desc: "Post AI follow-up actions as leasing notes", enabled: false, locked: false },
                    { label: "Read leasing team members", desc: "Sync agent roster from Entrata", enabled: true, locked: false },
                  ].map((perm, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${perm.enabled ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${perm.enabled ? "bg-primary border-primary" : "border-border"} ${perm.locked ? "opacity-60" : ""}`}>
                        {perm.enabled && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{perm.label}</div>
                        <div className="text-xs text-muted-foreground">{perm.desc}</div>
                      </div>
                      {perm.locked && <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Required</span>}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1">Entrata connected</h3>
                  <p className="text-sm text-muted-foreground mb-5">Tour is now syncing with your Entrata account. Guest cards and tour scores will sync automatically.</p>
                  <div className="w-full rounded-xl border border-border p-3 text-left space-y-2">
                    {[
                      { label: "Domain", value: domain || "yourcompany.entrata.com" },
                      { label: "Property ID", value: propertyId || "123456" },
                      { label: "Last synced", value: "Just now" },
                      { label: "Guest cards found", value: "8 matched" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between gap-3">
          {step === 1 && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
              <button onClick={() => setStep(2)} disabled={!domain || !apiKey}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                Continue
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary">Back</button>
              <button onClick={() => void testConnection().catch((caught) => setError(caught instanceof Error ? caught.message : "Connection failed"))}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                {testing ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Testing connection…</> : "Test & connect"}
              </button>
            </>
          )}
          {step === 3 && (
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
              Done
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main Settings screen ─── */
export function Settings({ onNavigate, onSelectSession }: {
  onNavigate: (view: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const { sessions, agents, properties } = useAdminData();
  const initialParams = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState<SettingsTab>((initialParams.get("tab") as SettingsTab | null) ?? "profile");
  const [entraStatus, setEntraStatus] = useState<EntraStatus>("disconnected");
  const [entrataDomain, setEntrataDomain] = useState<string | null>(null);
  const [entrataPropertyId, setEntrataPropertyId] = useState<string | null>(null);
  const [entrataStats, setEntrataStats] = useState<EntrataStats>({});
  const [entrataLastSync, setEntrataLastSync] = useState<string | null>(null);
  const [entrataError, setEntrataError] = useState<string | null>(null);
  const [syncingEntrata, setSyncingEntrata] = useState(false);
  const [showEntraModal, setShowEntraModal] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile state
  const [name, setName] = useState("Rachel Park");
  const [email, setEmail] = useState("rachel.park@themeridianmgmt.com");
  const [role, setRole] = useState("Regional Manager");
  const [company, setCompany] = useState("Meridian Management Group");

  // Notification prefs
  const [notifs, setNotifs] = useState({
    lowScore: true,
    newSession: true,
    weeklyReport: true,
    prospectConvert: false,
    coachingMentions: true,
  });

  const loadIntegrations = async () => {
    const response = await fetch(apiUrl("/api/admin/integrations")).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    const entrata = data.integrations?.entrata;
    if (!entrata) return;
    setEntraStatus(entrata.status ?? "disconnected");
    setEntrataDomain(entrata.domain ?? null);
    setEntrataPropertyId(entrata.propertyId ?? null);
    setEntrataStats(entrata.stats ?? {});
    setEntrataLastSync(entrata.lastSyncedAt ?? null);
    setEntrataError(entrata.lastError ?? null);
  };

  useEffect(() => {
    void loadIntegrations();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== "profile") params.set("tab", activeTab);
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [activeTab]);

  const syncEntrata = async () => {
    setSyncingEntrata(true);
    setEntrataError(null);
    try {
      const response = await fetch(apiUrl("/api/admin/integrations/entrata/sync"), { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Sync failed");
      setEntrataStats(data.integration?.stats ?? {});
      setEntrataLastSync(data.integration?.lastSyncedAt ?? new Date().toISOString());
    } catch (caught) {
      setEntrataError(caught instanceof Error ? caught.message : "Sync failed");
    } finally {
      setSyncingEntrata(false);
    }
  };

  const handleSave = async () => {
    await Promise.all([
      fetch(apiUrl("/api/admin/settings/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, company }),
      }),
      fetch(apiUrl("/api/admin/settings/notifications"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifs),
      }),
    ]).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: "profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    { key: "integrations", label: "Integrations", icon: <Link2 className="w-4 h-4" /> },
    { key: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { key: "security", label: "Security", icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      <AnimatePresence>
        {showEntraModal && (
          <EntrataConnectModal
            onClose={() => setShowEntraModal(false)}
            onConnected={() => {
              setEntraStatus("connected");
              void loadIntegrations();
            }}
          />
        )}
      </AnimatePresence>

      <NavHeader onNavigate={onNavigate} />

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your profile, integrations, and platform preferences.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          {/* Sidebar nav */}
          <nav className="space-y-1">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${activeTab === tab.key ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}`}>
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="min-w-0">
            <AnimatePresence mode="wait">

              {/* ── PROFILE ── */}
              {activeTab === "profile" && (
                <motion.div key="profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="rounded-2xl border border-border bg-card p-6 mb-5">
                    <h3 className="font-semibold text-foreground mb-5">Personal information</h3>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl font-black text-foreground">
                        {name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <button className="text-sm font-semibold text-primary hover:opacity-80 transition-opacity">Change avatar</button>
                        <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG up to 2 MB</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Full name", value: name, setter: setName },
                        { label: "Email address", value: email, setter: setEmail },
                        { label: "Role / title", value: role, setter: setRole },
                        { label: "Company", value: company, setter: setCompany },
                      ].map(({ label, value, setter }) => (
                        <div key={label}>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
                          <input value={value} onChange={e => setter(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6 mb-5">
                    <h3 className="font-semibold text-foreground mb-4">Properties managed</h3>
                    <div className="space-y-2">
                      {properties.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                          <div className="flex items-center gap-2.5">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{agents.filter(a => a.propertyId === p.id).length} agents</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">Admin</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={handleSave}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
                      {saved ? <><Check className="w-4 h-4" /> Saved</> : "Save changes"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── INTEGRATIONS ── */}
              {activeTab === "integrations" && (
                <motion.div key="integrations" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {/* Entrata — featured */}
                  <div className={`rounded-2xl border p-6 mb-5 ${entraStatus === "connected" ? "border-emerald-200 bg-emerald-50/30" : "border-border bg-card"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#e8f0fe] flex items-center justify-center shrink-0">
                          <Building2 className="w-6 h-6 text-[#1a56db]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-foreground">Entrata</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Recommended</span>
                          </div>
                          <p className="text-sm text-muted-foreground">Sync guest cards, prospect data, and leasing notes. Tour scores and AI follow-up actions push directly into Entrata records.</p>
                          {entrataDomain && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {entrataDomain}{entrataPropertyId ? ` · Property ${entrataPropertyId}` : ""}
                            </p>
                          )}
                          {entraStatus === "error" && entrataError && (
                            <p className="text-xs text-red-600 mt-1">{entrataError}</p>
                          )}
                        </div>
                      </div>
                      {entraStatus === "connected" ? (
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                          </span>
                          <button className="text-xs text-muted-foreground hover:text-red-500 transition-colors px-2.5 py-1 rounded-full border border-border hover:border-red-200"
                            onClick={() => {
                              setEntraStatus("disconnected");
                              void fetch(apiUrl("/api/admin/integrations"), {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ provider: "entrata", status: "disconnected" }),
                              });
                              setEntrataStats({});
                              setEntrataLastSync(null);
                            }}>
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setShowEntraModal(true)}
                          className="shrink-0 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
                          Connect
                        </button>
                      )}
                    </div>

                    {entraStatus === "connected" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        className="mt-5 pt-5 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                          { label: "Guest cards synced", value: String(entrataStats.guestCardsSynced ?? 0) },
                          { label: "Properties synced", value: String(entrataStats.propertiesSynced ?? 0) },
                          { label: "Units synced", value: String(entrataStats.unitsSynced ?? 0) },
                          { label: "Last sync", value: entrataLastSync ? new Date(entrataLastSync).toLocaleString() : "Not synced" },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div className="text-xl font-black text-foreground">{value}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                          </div>
                        ))}
                        <div className="col-span-full flex gap-3 mt-2">
                          <button onClick={() => void syncEntrata()} disabled={syncingEntrata} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingEntrata ? "animate-spin" : ""}`} /> {syncingEntrata ? "Syncing…" : "Sync now"}
                          </button>
                          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" /> Open in Entrata
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Other CRMs */}
                  <div className="rounded-2xl border border-border bg-card p-6 mb-5">
                    <h3 className="font-semibold text-foreground mb-4">Other integrations</h3>
                    <div className="space-y-4">
                      {[
                        { name: "Yardi Voyager", desc: "Sync leasing data with Yardi property management.", icon: "Y", color: "bg-orange-100 text-orange-700", available: true },
                        { name: "RealPage", desc: "Connect to RealPage for prospect and lease tracking.", icon: "R", color: "bg-sky-100 text-sky-700", available: true },
                        { name: "Salesforce", desc: "Push tour scores and follow-up actions to Salesforce CRM.", icon: "SF", color: "bg-blue-100 text-blue-700", available: false },
                        { name: "HubSpot", desc: "Sync contacts and deal stages with HubSpot.", icon: "H", color: "bg-orange-100 text-orange-700", available: false },
                      ].map(crm => (
                        <div key={crm.name} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${crm.color}`}>
                            {crm.icon}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-foreground">{crm.name}</div>
                            <div className="text-xs text-muted-foreground">{crm.desc}</div>
                          </div>
                          {crm.available ? (
                            <button className="shrink-0 px-3 py-1.5 rounded-full border border-border text-xs font-semibold text-foreground hover:bg-secondary transition-colors">
                              Connect
                            </button>
                          ) : (
                            <span className="shrink-0 text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">Coming soon</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* API access */}
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">API access</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Use the Tour API to build custom integrations.</p>
                      </div>
                      <button className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity">
                        <ExternalLink className="w-3.5 h-3.5" /> View docs
                      </button>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-input-background border border-border">
                      <code className="flex-1 text-xs font-mono text-foreground truncate">tour_live_sk_••••••••••••••••••••••••••••</code>
                      <button className="text-xs font-semibold text-primary hover:opacity-80 shrink-0">Reveal</button>
                      <button className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0">Rotate</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── NOTIFICATIONS ── */}
              {activeTab === "notifications" && (
                <motion.div key="notifications" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-foreground mb-5">Email notifications</h3>
                    <div className="space-y-4">
                      {[
                        { key: "lowScore" as const, label: "Low score alert", desc: "Email me when a session scores below 70." },
                        { key: "newSession" as const, label: "New session analyzed", desc: "Notify me when a new tour session is scored." },
                        { key: "weeklyReport" as const, label: "Weekly performance report", desc: "Receive a team summary every Monday morning." },
                        { key: "prospectConvert" as const, label: "Prospect conversion", desc: "Alert when a prospect status changes to Converted." },
                        { key: "coachingMentions" as const, label: "Coaching note mentions", desc: "Notify me when I'm mentioned in a coaching note." },
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
                          <div>
                            <div className="text-sm font-medium text-foreground">{label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                          </div>
                          <button
                            onClick={() => setNotifs(prev => ({ ...prev, [key]: !prev[key] }))}
                            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${notifs[key] ? "bg-primary" : "bg-secondary border border-border"}`}
                          >
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${notifs[key] ? "left-5" : "left-1"}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── SECURITY ── */}
              {activeTab === "security" && (
                <motion.div key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="rounded-2xl border border-border bg-card p-6 mb-5">
                    <h3 className="font-semibold text-foreground mb-5">Password</h3>
                    <div className="space-y-4 max-w-sm">
                      {[
                        { label: "Current password", placeholder: "••••••••••" },
                        { label: "New password", placeholder: "Min. 12 characters" },
                        { label: "Confirm new password", placeholder: "••••••••••" },
                      ].map(({ label, placeholder }) => (
                        <div key={label}>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
                          <input type="password" placeholder={placeholder}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                      ))}
                      <button className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
                        Update password
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6 mb-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">Two-factor authentication</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Add an extra layer of security to your account.</p>
                      </div>
                      <span className="text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full border border-border">Not enabled</span>
                    </div>
                    <button className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                      Enable 2FA
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-foreground mb-4">Active sessions</h3>
                    <div className="space-y-3">
                      {[
                        { device: "MacBook Pro — Chrome", location: "Chicago, IL", time: "Active now", current: true },
                        { device: "iPhone 16 Pro — Safari", location: "Chicago, IL", time: "2 hours ago", current: false },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                          <div>
                            <div className="text-sm font-medium text-foreground flex items-center gap-2">
                              {s.device}
                              {s.current && <span className="text-xs text-emerald-600 font-semibold">This device</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">{s.location} · {s.time}</div>
                          </div>
                          {!s.current && (
                            <button className="text-xs text-red-500 hover:text-red-600 font-medium">Sign out</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
