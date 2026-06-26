import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { SessionDetail } from "./components/SessionDetail";
import { Analytics } from "./components/Analytics";
import { Team } from "./components/Team";
import { Rubrics } from "./components/Rubrics";
import { Prospects } from "./components/Prospects";
import { Settings } from "./components/Settings";
import { Sessions } from "./components/Sessions";
import { Login } from "./components/Login";
import { AdminDataProvider } from "./data/AdminDataContext";

type View = "login" | "dashboard" | "session" | "sessions" | "analytics" | "team" | "rubrics" | "prospects" | "settings";

type RouteState = {
  view: View;
  sessionId: string | null;
  rubricId: string | null;
};

const VIEW_PATHS: Record<Exclude<View, "session">, string> = {
  login: "/login",
  dashboard: "/",
  sessions: "/sessions",
  analytics: "/analytics",
  team: "/team",
  rubrics: "/rubrics",
  prospects: "/prospects",
  settings: "/settings",
};

function parseRoute(): RouteState {
  const segments = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [first, second] = segments;

  if (first === "login") return { view: "login", sessionId: null, rubricId: null };
  if (first === "sessions" && second) return { view: "session", sessionId: second, rubricId: null };
  if (first === "sessions") return { view: "sessions", sessionId: null, rubricId: null };
  if (first === "analytics") return { view: "analytics", sessionId: null, rubricId: null };
  if (first === "team") return { view: "team", sessionId: null, rubricId: null };
  if (first === "rubrics" && second) return { view: "rubrics", sessionId: null, rubricId: second };
  if (first === "rubrics") return { view: "rubrics", sessionId: null, rubricId: null };
  if (first === "prospects") return { view: "prospects", sessionId: null, rubricId: null };
  if (first === "settings") return { view: "settings", sessionId: null, rubricId: null };

  return { view: "dashboard", sessionId: null, rubricId: null };
}

function pushRoute(path: string) {
  if (window.location.pathname + window.location.search === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute());

  useEffect(() => {
    const syncRoute = () => setRoute(parseRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const goToSession = (id: string) => {
    pushRoute(`/sessions/${encodeURIComponent(id)}`);
  };

  const goToRubric = (id: string) => {
    pushRoute(`/rubrics/${encodeURIComponent(id)}`);
  };

  const navigate = (v: string) => {
    const next = v as Exclude<View, "session">;
    pushRoute(VIEW_PATHS[next] ?? "/");
  };

  return (
    <AdminDataProvider>
    <div className="size-full">
      {route.view === "login" && (
        <Login onLogin={() => navigate("dashboard")} />
      )}
      {route.view === "dashboard" && (
        <Dashboard onSelectSession={goToSession} onNavigate={navigate} />
      )}
      {route.view === "session" && (
        <SessionDetail sessionId={route.sessionId} onBack={() => navigate("sessions")} onNavigate={navigate} />
      )}
      {route.view === "sessions" && (
        <Sessions onNavigate={navigate} onSelectSession={goToSession} />
      )}
      {route.view === "analytics" && (
        <Analytics onNavigate={navigate} onSelectSession={goToSession} />
      )}
      {route.view === "team" && (
        <Team onNavigate={navigate} onSelectSession={goToSession} />
      )}
      {route.view === "rubrics" && (
        <Rubrics onNavigate={navigate} selectedRubricId={route.rubricId} onSelectRubric={goToRubric} onBackToRubrics={() => navigate("rubrics")} />
      )}
      {route.view === "prospects" && (
        <Prospects onNavigate={navigate} onSelectSession={goToSession} />
      )}
      {route.view === "settings" && (
        <Settings onNavigate={navigate} onSelectSession={goToSession} />
      )}
    </div>
    </AdminDataProvider>
  );
}
