import { useState } from "react";
import { Building2, Lock, Mail, Play, ShieldCheck } from "lucide-react";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("rachel.park@themeridianmgmt.com");
  const [password, setPassword] = useState("password");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Play className="w-4 h-4 fill-white text-white" />
          </div>
          <div>
            <div className="font-bold text-foreground leading-none">Tour admin</div>
            <div className="text-xs text-muted-foreground mt-1">Manager workspace</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h1 className="text-foreground" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Use a demo account or connect through Entrata.</p>

          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            <Building2 className="w-4 h-4 text-primary" />
            Continue with Entrata
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-muted-foreground">or</span></div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Email</span>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-input-background px-3 py-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="email"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-input-background px-3 py-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  type="password"
                />
              </div>
            </label>
          </div>

          <button
            onClick={onLogin}
            disabled={!email.trim() || !password.trim()}
            className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all"
          >
            Sign in
          </button>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Demo auth only. Entrata SSO wiring can attach here.
          </div>
        </div>
      </div>
    </div>
  );
}
