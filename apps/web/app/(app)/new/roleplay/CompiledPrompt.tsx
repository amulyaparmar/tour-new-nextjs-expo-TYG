// @ts-nocheck
"use client";

// The "compiled prompt" view — a light, site-themed panel of exactly what a
// scenario sends to Vapi, built by running the real buildRoleplayInitObj().
// Shown inside the on-demand preview modal (PromptPreview).

import { Copy } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import {
  buildRoleplayInitObj,
  ROLEPLAY_BASE_ASSISTANT_ID,
} from "@/lib/roleplay/buildAssistantOverrides";
import { roleplayPassThreshold } from "@/lib/roleplay/grading";

const copy = (text, label) => {
  navigator.clipboard?.writeText(text);
  toast.success(`${label} copied`);
};

// Renders prompt text with [Section] headers highlighted so structure pops.
const Highlighted = ({ text }) => {
  const lines = String(text).split("\n");
  return (
    <div className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.6]">
      {lines.map((ln, i) => {
        const isHeader = /^\s*\[[^\]]+\]/.test(ln);
        const isBullet = /^\s*[-•]\s/.test(ln);
        return (
          <div
            key={i}
            className={
              isHeader
                ? "text-blue-600 font-semibold mt-3 first:mt-0"
                : isBullet
                ? "text-gray-500"
                : "text-gray-700"
            }
          >
            {ln === "" ? " " : ln}
          </div>
        );
      })}
    </div>
  );
};

const Label = ({ children, action }) => (
  <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </span>
    {action}
  </div>
);

const CopyBtn = ({ text, label }) => (
  <button
    type="button"
    onClick={() => copy(text, label)}
    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
  >
    <Copy size={12} /> Copy
  </button>
);

export const CompiledPrompt = ({ scenario }) => {
  const { assistantId, assistantOverrides: o } = buildRoleplayInitObj(scenario);

  const systemPrompt = o.model?.messages?.[0]?.content ?? "(none)";
  const graderPrompt = o.analysisPlan?.structuredDataPlan?.messages?.[0]?.content ?? "(none)";
  const agentFirst = o.firstMessageMode === "assistant-waits-for-user";
  const hasEndCall = (o.model?.tools ?? []).some((t) => t.type === "endCall");
  const waypointTool = (o.model?.tools ?? []).find(
    (tool) => tool.type === "function" && tool.function?.name === "WaypointComplete"
  );
  const waypointCount =
    waypointTool?.function?.parameters?.properties?.waypointId?.enum?.length ?? 0;
  const voiceLabel = o.voice
    ? `${o.voice.provider} / ${o.voice.voiceId}`
    : `base voice · no override (${scenario.voice?.label ?? "Elliot"})`;

  const spokenGrade = systemPrompt.includes("[End-of-roleplay grading");
  const meta = [
    ["Assistant", assistantId === ROLEPLAY_BASE_ASSISTANT_ID ? "base · unchanged" : assistantId],
    ["Model", `${o.model?.provider}/${o.model?.model} · t${o.model?.temperature} · ${o.model?.maxTokens}tok`],
    ["Voice", voiceLabel],
    ["Opens", agentFirst ? "trainee first (inbound)" : "AI first (verbatim)"],
    ["Hang up", hasEndCall ? "endCall on" : "off"],
    ["Waypoints", `${waypointCount} · WaypointComplete ${waypointTool ? "on" : "off"}`],
    ["Spoken grade", spokenGrade ? "on · debrief (costs more)" : "off · text only"],
    ["Limits", `silence ${o.silenceTimeoutSeconds}s · max ${o.maxDurationSeconds}s`],
    [
      "Transcriber",
      o.transcriber
        ? `${o.transcriber.provider}/${o.transcriber.model}${
            o.transcriber.confidenceThreshold !== undefined
              ? ` · conf ${o.transcriber.confidenceThreshold}`
              : ""
          }`
        : "assistant default",
    ],
    [
      "Turn-taking",
      o.stopSpeakingPlan
        ? `interrupt ≥${o.stopSpeakingPlan.numWords} words · wait ${o.startSpeakingPlan?.waitSeconds ?? "?"}s${
            o.startSpeakingPlan?.smartEndpointingPlan?.provider
              ? ` · ${o.startSpeakingPlan.smartEndpointingPlan.provider}`
              : ""
          }`
        : "assistant default",
    ],
  ];

  const box = "rounded-md border border-gray-200 bg-gray-50 p-3";

  return (
    <div className="flex flex-col text-gray-700">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          Compiled prompt
        </span>
        <span className="text-[11px] text-gray-400">— what Vapi receives</span>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Config */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {meta.map(([k, v]) => (
            <div key={k} className="flex flex-col min-w-0">
              <span className="text-[9px] uppercase tracking-[0.12em] text-gray-400">{k}</span>
              <span className="text-[11px] text-gray-700 truncate font-mono" title={v}>
                {v}
              </span>
            </div>
          ))}
        </div>

        {/* Opening */}
        <div>
          <Label>Opening line</Label>
          <div className={`${box} text-[11.5px] text-gray-600`}>
            {agentFirst ? (
              <>
                <span className="text-amber-600">inbound · </span>
                AI waits, then opens (may rephrase):{" "}
                <span className="italic text-gray-800">"{scenario.firstMessage}"</span>
              </>
            ) : (
              <span className="italic text-gray-800">"{o.firstMessage}"</span>
            )}
          </div>
        </div>

        {/* System prompt */}
        <div>
          <Label action={<CopyBtn text={systemPrompt} label="System prompt" />}>
            System prompt · the AI prospect
          </Label>
          <div className={`${box} max-h-[38vh] overflow-y-auto`}>
            <Highlighted text={systemPrompt} />
          </div>
        </div>

        {/* Grader prompt */}
        <div>
          <Label action={<CopyBtn text={graderPrompt} label="Grading prompt" />}>
            Grading prompt · post-call, never spoken
          </Label>
          <div className={`${box} max-h-[26vh] overflow-y-auto`}>
            <Highlighted text={graderPrompt} />
          </div>
        </div>

        {/* Returns */}
        <div>
          <Label>Structured result the grader returns</Label>
          <div className={`${box} font-mono text-[11px] text-gray-500 flex flex-col gap-1`}>
            <div className="text-gray-700">
              overallScore 0–100 · passed (≥{roleplayPassThreshold(scenario)})
            </div>
            <div className="text-gray-400">categoryScores 0–20:</div>
            {(scenario.rubric ?? []).length === 0 && (
              <div className="pl-3 text-rose-500">no rubric categories yet</div>
            )}
            {(scenario.rubric ?? []).map((c) => (
              <div key={c.key} className="pl-3">
                <span className="text-emerald-600">{c.key}</span>{" "}
                {c.label || <span className="text-rose-500">(empty — dropped)</span>}
              </div>
            ))}
            {(scenario.checkpoints ?? []).length > 0 && (
              <>
                <div className="text-gray-400 mt-1">checkpoints true/false:</div>
                {scenario.checkpoints.map((cp) => (
                  <div key={cp.id} className="pl-3">
                    <span className="text-blue-600">{cp.id}</span> {cp.name}
                  </div>
                ))}
              </>
            )}
            <div className="text-gray-400 mt-1">highlights[] · improvements[]</div>
          </div>
        </div>
      </div>
    </div>
  );
};
