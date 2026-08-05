// @ts-nocheck
"use client";

// Container for the AI Roleplay Training tab on /new. Owns the view state
// machine (home | edit | run | scorecard | history-detail) and the scenario
// collection. Unlike the usevoice.ai-TYG original (sidebar with Scenarios /
// Practice history subtabs), the home view stacks both: scenarios on top,
// practice history below.

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScenarioList } from "./ScenarioList";
import { ScenarioEditor } from "./ScenarioEditor";
import { RoleplaySession } from "./RoleplaySession";
import { Scorecard } from "./Scorecard";
import { PracticeHistory } from "./PracticeHistory";
import { HistoryDetail } from "./HistoryDetail";

export function RoleplayPanel({ profileName }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState("home"); // home | edit | run | scorecard
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeScenario, setActiveScenario] = useState(null); // for edit/run
  const [lastCallId, setLastCallId] = useState(null); // for scorecard
  const [lastTranscript, setLastTranscript] = useState([]); // live turns for scorecard
  // The opened history attempt lives in the URL (?attempt=<id>) so browser
  // back/forward steps between the detail view and the panel home. Run and
  // scorecard stay local state on purpose — a restored URL cannot resurrect
  // an in-flight call. The attempt param takes precedence over local view.
  const historyAttemptId = searchParams.get("attempt");
  const effectiveView = historyAttemptId ? "history-detail" : view;

  const withParams = (mutate) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    return query ? `/new?${query}` : "/new";
  };
  const openAttempt = (attemptId) =>
    router.push(
      withParams((params) => {
        params.set("tab", "roleplay");
        params.set("attempt", attemptId);
      }),
      { scroll: false }
    );
  const closeAttempt = () =>
    router.push(
      withParams((params) => params.delete("attempt")),
      { scroll: false }
    );

  const loadScenarios = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/roleplay/scenarios");
      const data = await res.json();
      if (data.success) setScenarios(data.scenarios);
      else toast.error(`Could not load scenarios: ${data.message}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not load scenarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios();
  }, []);

  const handleSaved = (scenario) => {
    setScenarios((prev) => {
      const idx = prev.findIndex((s) => s.id === scenario.id);
      if (idx >= 0) return prev.map((s) => (s.id === scenario.id ? scenario : s));
      return [scenario, ...prev];
    });
    setView("home");
  };

  const handleDelete = async (scenario) => {
    // Optimistic remove; restore on failure.
    const prev = scenarios;
    setScenarios((p) => p.filter((s) => s.id !== scenario.id));
    try {
      const res = await fetch(`/api/roleplay/scenarios?id=${encodeURIComponent(scenario.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success("Scenario deleted");
    } catch (e) {
      console.error(e);
      setScenarios(prev);
      toast.error(`Could not delete scenario: ${e.message}`);
    }
  };

  return (
    <div>
      {effectiveView === "home" && (
        <div className="flex flex-col gap-4 w-full">
          {/* Scenarios — top */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Scenarios</h2>
              <p className="text-sm text-gray-500">
                Practice live voice scenarios against an AI prospect and review graded attempts.
              </p>
            </div>
            <button
              onClick={() => {
                setActiveScenario(null);
                setView("edit");
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shrink-0"
            >
              <Plus size={17} /> New scenario
            </button>
          </div>

          <ScenarioList
            scenarios={scenarios}
            loading={loading}
            onRun={(s) => {
              setActiveScenario(s);
              setView("run");
            }}
            onEdit={(s) => {
              setActiveScenario(s);
              setView("edit");
            }}
            onDelete={handleDelete}
          />

          {/* Practice history — below */}
          <div className="mt-2 border-t border-gray-200 pt-4">
            <h2 className="text-lg font-semibold text-gray-900">Practice history</h2>
            <p className="text-sm text-gray-500 mb-3">
              Your graded attempts, newest first — switch to Team to see everyone at this
              property.
            </p>
            <PracticeHistory onOpen={openAttempt} />
          </div>
        </div>
      )}

      {effectiveView !== "home" && (
        <div>
          {effectiveView === "history-detail" && (
            <HistoryDetail
              attemptId={historyAttemptId}
              scenarios={scenarios}
              onBack={closeAttempt}
            />
          )}

          {view === "edit" && (
            <ScenarioEditor
              scenario={activeScenario}
              onSaved={handleSaved}
              onCancel={() => setView("home")}
            />
          )}

          {view === "run" && activeScenario && (
            <RoleplaySession
              scenario={activeScenario}
              traineeName={profileName}
              onBack={() => setView("home")}
              onCallEnded={(callId, transcript) => {
                setLastCallId(callId);
                setLastTranscript(transcript || []);
                setView("scorecard");
              }}
            />
          )}

          {view === "scorecard" && activeScenario && lastCallId && (
            <Scorecard
              callId={lastCallId}
              scenario={activeScenario}
              traineeName={profileName}
              liveTranscript={lastTranscript}
              onBack={() => setView("home")}
              onRetryCall={() => setView("run")}
            />
          )}
        </div>
      )}
    </div>
  );
}
