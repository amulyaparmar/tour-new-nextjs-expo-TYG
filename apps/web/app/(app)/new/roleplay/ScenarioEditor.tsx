// @ts-nocheck
"use client";

// Create/edit form for a roleplay scenario. Single column, grouped into
// labeled sections, with a sticky top action bar (Preview + Save). Checkpoints
// and rubric are in-memory arrays; rubric capped at 5 rows, keys auto-assigned
// c1..c5 on save. "Preview" opens the compiled-prompt console as a modal.

import { ArrowLeft, Eye, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { TEMPLATE_BLOCKS } from "@/lib/roleplay/promptTemplate";
import { ensureScenarioWaypoints } from "@/lib/roleplay/waypoints";
import { HelpTip } from "./HelpTip";
import { PromptPreview } from "./PromptPreview";
import { ROLEPLAY_VOICES } from "./voices";

const emptyCheckpoint = () => ({
  id: `cp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  name: "",
  description: "",
  required: true,
  rubricKey: "",
});

const emptyRubricRow = () => ({ key: "c1", label: "", description: "" });

const emptyWaypoint = () => ({
  id: `waypoint-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  type: "guidance",
  title: "",
  cue: "",
  completionCriteria: "",
  suggestedLines: [],
});

const DEFAULTS = {
  name: "",
  description: "",
  personaPrompt: "",
  firstMessage: "",
  voice: {
    provider: ROLEPLAY_VOICES[0].provider,
    voiceId: ROLEPLAY_VOICES[0].voiceId,
    label: ROLEPLAY_VOICES[0].label,
  },
  difficulty: "medium",
  speaksFirst: "prospect",
  spokenGrading: false,
  passThreshold: 70,
  templateOverrides: {},
  waypoints: [emptyWaypoint(), emptyWaypoint()],
  checkpoints: [emptyCheckpoint()],
  rubric: [emptyRubricRow()],
  knobs: { silenceTimeoutSeconds: 30, maxDurationSeconds: 600, temperature: 0.6 },
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `cp-${Date.now()}`;

// Consistent section header: a short accent rule + uppercase label + hint.
const Section = ({ title, hint, children }) => (
  <section className="border-t border-gray-100 pt-6 first:border-t-0 first:pt-0">
    <div className="mb-4 flex gap-2.5">
      <span className="mt-[3px] h-3.5 w-[3px] rounded-full bg-blue-500 shrink-0" />
      <div>
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-800">
          {title}
        </h3>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </div>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);

export const ScenarioEditor = ({ scenario, onSaved, onCancel }) => {
  const [form, setForm] = useState(() => {
    if (!scenario) return { ...DEFAULTS };
    const merged = { ...DEFAULTS, ...scenario };
    return { ...merged, waypoints: ensureScenarioWaypoints(merged) };
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState("scenario"); // scenario | advanced

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Advanced-template helpers: set/reset a per-scenario override for a block.
  const setTpl = (key, value) =>
    setForm((f) => ({ ...f, templateOverrides: { ...(f.templateOverrides || {}), [key]: value } }));
  const resetTpl = (key) =>
    setForm((f) => {
      const t = { ...(f.templateOverrides || {}) };
      delete t[key];
      return { ...f, templateOverrides: t };
    });

  // Cleans the raw form into the scenario object we save AND preview — identical
  // logic for both, so the console reflects exactly what will run.
  const cleanedScenario = () => {
    const rubricEntries = form.rubric
      .map((category, originalIndex) => ({ category, sourceKey: `c${originalIndex + 1}` }))
      .filter(({ category }) => category.label.trim())
      .slice(0, 5)
      .map(({ category, sourceKey }, index) => ({
        category: { ...category, key: `c${index + 1}` },
        sourceKey,
      }));
    const rubric = rubricEntries.map(({ category }) => category);
    const rubricLinkMap = new Map(
      rubricEntries.map(({ category, sourceKey }) => [sourceKey, category.key])
    );
    const seenIds = new Set();
    const checkpoints = form.checkpoints
      .filter((cp) => cp.name.trim())
      .map((cp) => {
        let id = cp.id?.startsWith("cp-") ? slugify(cp.name) : cp.id || slugify(cp.name);
        let unique = id;
        let n = 2;
        while (seenIds.has(unique)) unique = `${id}-${n++}`;
        seenIds.add(unique);
        const { rubricKey, ...rest } = cp;
        return {
          ...rest,
          id: unique,
          required: cp.required !== false,
          ...(rubricLinkMap.has(rubricKey)
            ? { rubricKey: rubricLinkMap.get(rubricKey) }
            : {}),
        };
      });
    const waypointIds = new Set();
    const waypoints = (form.waypoints || [])
      .filter((waypoint) => waypoint.title.trim())
      .slice(0, 4)
      .map((waypoint, index) => {
        const baseId = slugify(waypoint.id?.startsWith("waypoint-") ? waypoint.title : waypoint.id || waypoint.title);
        let id = baseId || `waypoint-${index + 1}`;
        let suffix = 2;
        while (waypointIds.has(id)) id = `${baseId}-${suffix++}`;
        waypointIds.add(id);
        return {
          ...waypoint,
          id,
          type: ["objection", "guidance", "value"].includes(waypoint.type)
            ? waypoint.type
            : "guidance",
          title: waypoint.title.trim(),
          cue: waypoint.cue.trim(),
          completionCriteria: waypoint.completionCriteria.trim(),
          suggestedLines: (waypoint.suggestedLines || [])
            .map((line) => String(line).trim())
            .filter(Boolean)
            .slice(0, 3),
        };
      });
    const rawPassThreshold = form.passThreshold === "" ? NaN : Number(form.passThreshold);
    const passThreshold = Number.isFinite(rawPassThreshold)
      ? Math.min(100, Math.max(0, Math.round(rawPassThreshold)))
      : 70;
    // Keep only template overrides that are non-empty AND actually differ from
    // the default, so unedited blocks keep tracking the shared default.
    const templateOverrides = {};
    for (const b of TEMPLATE_BLOCKS) {
      const v = form.templateOverrides?.[b.key];
      if (typeof v === "string" && v.trim() && v.trim() !== b.default.trim()) {
        templateOverrides[b.key] = v;
      }
    }
    return { ...form, waypoints, checkpoints, rubric, passThreshold, templateOverrides };
  };

  const updateArr = (arrKey, idx, field, value) =>
    setForm((f) => ({
      ...f,
      [arrKey]: f[arrKey].map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    }));

  const addRow = (arrKey, maker, cap) =>
    setForm((f) => (cap && f[arrKey].length >= cap ? f : { ...f, [arrKey]: [...f[arrKey], maker()] }));

  const removeRow = (arrKey, idx) =>
    setForm((f) => ({ ...f, [arrKey]: f[arrKey].filter((_, i) => i !== idx) }));

  const removeRubricRow = (idx) =>
    setForm((f) => {
      const removedNumber = idx + 1;
      const checkpoints = f.checkpoints.map((checkpoint) => {
        const linkedNumber = Number(String(checkpoint.rubricKey || "").replace(/^c/, ""));
        if (!Number.isInteger(linkedNumber)) return checkpoint;
        if (linkedNumber === removedNumber) {
          const { rubricKey, ...rest } = checkpoint;
          return rest;
        }
        return linkedNumber > removedNumber
          ? { ...checkpoint, rubricKey: `c${linkedNumber - 1}` }
          : checkpoint;
      });
      return {
        ...f,
        rubric: f.rubric.filter((_, rowIndex) => rowIndex !== idx),
        checkpoints,
      };
    });

  const save = async () => {
    if (!form.name.trim() || !form.personaPrompt.trim() || !form.firstMessage.trim()) {
      toast.error("Name, persona prompt, and first message are required.");
      return;
    }
    const payload = cleanedScenario();
    if (payload.waypoints.length < 2 || payload.waypoints.length > 4) {
      toast.error("Add between 2 and 4 Waypoints for the live coaching carousel.");
      return;
    }
    if (
      payload.waypoints.some(
        (waypoint) =>
          !waypoint.cue || !waypoint.completionCriteria || !waypoint.suggestedLines.length
      )
    ) {
      toast.error("Each Waypoint needs a cue, completion criteria, and at least one suggested line.");
      return;
    }
    if (payload.rubric.length === 0) {
      toast.error("Add at least one rubric category so the roleplay can be graded.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/roleplay/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Save failed");
      toast.success("Scenario saved");
      onSaved(data.scenario);
    } catch (e) {
      console.error(e);
      toast.error(`Could not save scenario: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // AI waypoint generation: sends the current form's scenario context (minus
  // the waypoints themselves) to the Gemini-backed route and replaces the
  // form's waypoints with the result. Nothing persists until Save.
  const generateWaypoints = async () => {
    if (!form.name.trim() || !form.personaPrompt.trim()) {
      toast.error("Add a name and persona prompt first — waypoints are generated from them.");
      return;
    }
    const hasContent = (form.waypoints || []).some(
      (waypoint) =>
        waypoint.title?.trim() || waypoint.cue?.trim() || waypoint.completionCriteria?.trim()
    );
    if (
      hasContent &&
      !window.confirm(
        "Replace the current waypoints with AI-generated ones? Nothing is saved until you hit Save scenario."
      )
    ) {
      return;
    }
    try {
      setGenerating(true);
      const { waypoints: _current, ...scenarioContext } = cleanedScenario();
      const res = await fetch("/api/roleplay/generate-waypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioContext }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Generation failed");
      setForm((f) => ({ ...f, waypoints: data.waypoints }));
      toast.success(`Generated ${data.waypoints.length} waypoints — review, tweak, then save.`);
    } catch (e) {
      console.error(e);
      toast.error(`Could not generate waypoints: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white transition-shadow";
  const labelCls = "text-sm font-medium text-gray-700 mb-1 block";
  const rubricOptions = form.rubric
    .map((category, index) => ({ key: `c${index + 1}`, label: category.label }))
    .filter((category) => category.label.trim())
    .slice(0, 5);

  return (
    <div className="w-full">
      {/* Sticky action bar — actions live at the top, always reachable.
          (Geometry adapted from the source repo's full-page layout: no -mt-8/
          pt-8 hack here, we sit inside RoleplayPanel's padded gray wrapper.) */}
      <div className="sticky top-0 z-30 mb-6 border-b border-gray-200 bg-white/90 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={16} /> Scenarios
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              <Eye size={15} /> Preview prompt
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-5 rounded-lg transition-colors text-sm"
            >
              {saving ? "Saving…" : "Save scenario"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 mb-5">
        {[
          ["scenario", "Scenario"],
          ["advanced", "Advanced template"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col gap-6 mb-10">
        {tab === "scenario" ? (
          <>
          {/* Overview */}
          <Section title="Overview" hint="How this scenario shows up in the list.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Price Objection — Young Professional"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Difficulty
                  <HelpTip>
                    <b>What difficulty changes:</b> the AI prospect's temperament. It injects one
                    instruction into the prospect's prompt — <b>easy</b> = cooperative, rarely
                    pushes back; <b>medium</b> = realistic, needs decent answers before warming up;{" "}
                    <b>hard</b> = skeptical and objection-heavy, only warms up if genuinely earned.
                    It also colors the badge on the scenario card.
                    <br />
                    <br />
                    <b>What it does NOT change:</b> grading. The rubric, checkpoints, and pass
                    threshold are identical at every level — a hard-mode 85 was simply earned
                    against more resistance. It also doesn't change the model, temperature, or call
                    timeouts (those are separate knobs below).
                  </HelpTip>
                </label>
                <select
                  className={inputCls}
                  value={form.difficulty}
                  onChange={(e) => set("difficulty", e.target.value)}
                >
                  <option value="easy">Easy — cooperative prospect</option>
                  <option value="medium">Medium — realistic prospect</option>
                  <option value="hard">Hard — skeptical, objection-heavy</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input
                className={inputCls}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="One-line summary of what this scenario practices"
              />
            </div>
          </Section>

          {/* The prospect */}
          <Section title="The prospect" hint="Who the AI plays, and the voice it uses.">
            <div>
              <label className={labelCls}>
                Persona &amp; situation *{" "}
                <span className="font-normal text-gray-400">
                  (who the AI is, their concerns, how they behave — wrapped with realism &amp; rules
                  automatically)
                </span>
              </label>
              <textarea
                className={`${inputCls} min-h-[150px] font-mono text-xs leading-relaxed`}
                value={form.personaPrompt}
                onChange={(e) => set("personaPrompt", e.target.value)}
                placeholder="You are a prospective renter who ..."
              />
            </div>

            <div>
              <label className={labelCls}>
                Voice
                <HelpTip>
                  Voices here match what's available on the org's Vapi account. Currently that's{" "}
                  <b>Elliot</b> — the base assistant's own Vapi-native voice (v2, speed 1.05). When
                  Elliot is selected, no voice override is sent, so the call uses the base
                  assistant's exact tuning. More voices will appear here after they've been vetted.
                </HelpTip>
              </label>
              <div className="flex gap-3 flex-wrap">
                {ROLEPLAY_VOICES.map((v) => (
                  <button
                    key={`${v.provider}:${v.voiceId}`}
                    type="button"
                    onClick={() =>
                      set("voice", { provider: v.provider, voiceId: v.voiceId, label: v.label })
                    }
                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
                      form.voice.voiceId === v.voiceId
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {v.src && (
                      <img
                        src={v.src}
                        alt={v.label}
                        className="h-10 w-10 rounded-full object-cover"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                      />
                    )}
                    <span className="text-left">
                      <span className="block text-sm font-medium text-gray-800">{v.label}</span>
                      {v.sublabel && (
                        <span className="block text-[11px] text-gray-400">{v.sublabel}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Call flow */}
          <Section title="Call flow" hint="Who opens the call, and with what.">
            <div>
              <label className={labelCls}>
                Who speaks first?
                <HelpTip>
                  <b>Prospect speaks first</b> (outbound-style): the call connects and the AI
                  immediately says the opening line below, word-for-word. The trainee is dropped
                  mid-conversation.
                  <br />
                  <br />
                  <b>Agent speaks first</b> (inbound-style — realistic for leasing): the AI stays
                  silent like a ringing caller; the trainee answers with their greeting ("Hello,
                  this is [property], how may I help you?"), and only then does the AI open. In this
                  mode the opening line is delivered through the AI's instructions, so it may be
                  lightly rephrased rather than spoken verbatim. If the trainee stays silent a few
                  seconds, the AI opens anyway.
                </HelpTip>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ["prospect", "Prospect (AI)", "outbound style"],
                  ["agent", "Agent (trainee)", "inbound style"],
                ].map(([val, title, sub]) => {
                  const active = (form.speaksFirst ?? "prospect") === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set("speaksFirst", val)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span
                        className={`block text-sm font-medium ${
                          active ? "text-blue-700" : "text-gray-700"
                        }`}
                      >
                        {title}
                      </span>
                      <span className="block text-xs text-gray-400">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={labelCls}>
                {form.speaksFirst === "agent" ? "Prospect's opening line *" : "First message *"}{" "}
                <span className="font-normal text-gray-400">
                  {form.speaksFirst === "agent"
                    ? "(what the AI opens with after the trainee's greeting — may be lightly rephrased)"
                    : "(the AI prospect speaks first with this exact line)"}
                </span>
              </label>
              <textarea
                className={`${inputCls} min-h-[60px]`}
                value={form.firstMessage}
                onChange={(e) => set("firstMessage", e.target.value)}
                placeholder="Hi, I'm calling about ..."
              />
            </div>
          </Section>

          {/* Live coaching and post-call grading */}
          <Section
            title="Coaching & grading"
            hint="Waypoints guide the live call; checkpoints and rubric score it afterward."
          >
            {/* Spoken debrief toggle — disabled while the debrief transcript
                boundary is reworked; see docs/spoken-debrief-boundary.md */}
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 opacity-60">
              <button
                type="button"
                role="switch"
                aria-checked={false}
                disabled
                title="Temporarily disabled"
                className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 bg-gray-200 justify-start cursor-not-allowed"
              >
                <span className="h-4 w-4 rounded-full bg-white shadow" />
              </button>
              <div>
                <div className="flex items-center text-sm font-medium text-gray-700">
                  Speak the grade aloud at the end
                  <HelpTip>
                    When on, the AI breaks character after the call wraps up and <b>reads the score
                    and coaching out loud</b> before hanging up — a spoken debrief, like the
                    original assistant did.
                    <br />
                    <br />
                    <b>This increases the cost of every call:</b> the AI generates and speaks a full
                    debrief, so you pay for extra model tokens, extra text-to-speech, and the added
                    voice minutes. Your written scorecard is produced server-side either way.
                  </HelpTip>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Temporarily disabled while the spoken-debrief transcript boundary is reworked
                  — all attempts are graded silently for now.
                </p>
              </div>
            </div>

            <div className="max-w-xs">
              <label className={labelCls}>
                Passing score
                <HelpTip>
                  The trainee must meet this overall score <b>and</b> hit every checkpoint marked
                  required. The default is 70 out of 100.
                </HelpTip>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className={inputCls}
                  value={form.passThreshold ?? 70}
                  onChange={(e) => set("passThreshold", e.target.value)}
                />
                <span className="shrink-0 text-sm text-gray-400">/ 100</span>
              </div>
            </div>

            {/* Live Waypoints */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Waypoints{" "}
                  <span className="font-normal text-gray-400">— 2–4 live coaching moments</span>
                  <HelpTip>
                    Define expected <b>objections</b>, important customer <b>guidance</b>, and
                    <b> value-creation</b> moments. During the call, the AI silently uses the
                    WaypointComplete function to check off a moment once the trainee clearly meets
                    its criteria. Waypoints guide the trainee but do not change the score.
                  </HelpTip>
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={generateWaypoints}
                    disabled={generating}
                    title="Generate scenario-specific waypoints with AI from the persona, checkpoints, and rubric"
                    className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800 disabled:cursor-wait disabled:text-gray-300"
                  >
                    <Sparkles size={15} /> {generating ? "Generating…" : "Generate with AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => addRow("waypoints", emptyWaypoint, 4)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                    disabled={(form.waypoints || []).length >= 4}
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
              </div>
              <p className="mb-3 text-xs text-gray-400">
                Keep these conversational and scenario-specific. Suggested wording should never
                invent prices, availability, amenities, or policies.
              </p>
              <div className="flex flex-col gap-3">
                {(form.waypoints || []).map((waypoint, index) => (
                  <div key={waypoint.id || index} className="rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                    <div className="flex items-start gap-2">
                      <select
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={waypoint.type || "guidance"}
                        onChange={(event) => updateArr("waypoints", index, "type", event.target.value)}
                        aria-label={`Waypoint ${index + 1} type`}
                      >
                        <option value="objection">Objection</option>
                        <option value="guidance">Guidance</option>
                        <option value="value">Value creation</option>
                      </select>
                      <input
                        className={`${inputCls} flex-1`}
                        value={waypoint.title}
                        onChange={(event) => updateArr("waypoints", index, "title", event.target.value)}
                        placeholder="Moment title"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow("waypoints", index)}
                        disabled={(form.waypoints || []).length <= 2}
                        className="p-2 text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:text-gray-200"
                        aria-label={`Remove Waypoint ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          When this moment matters
                        </label>
                        <textarea
                          className={`${inputCls} min-h-20 resize-y`}
                          value={waypoint.cue}
                          onChange={(event) => updateArr("waypoints", index, "cue", event.target.value)}
                          placeholder="What objection, signal, or guidance moment should bring this forward?"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          WaypointComplete criteria
                        </label>
                        <textarea
                          className={`${inputCls} min-h-20 resize-y`}
                          value={waypoint.completionCriteria}
                          onChange={(event) =>
                            updateArr("waypoints", index, "completionCriteria", event.target.value)
                          }
                          placeholder="What must the trainee clearly say or do?"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Suggested lines <span className="normal-case font-normal">— one per line, up to 3</span>
                      </label>
                      <textarea
                        className={`${inputCls} min-h-20 resize-y`}
                        value={(waypoint.suggestedLines || []).join("\n")}
                        onChange={(event) =>
                          updateArr(
                            "waypoints",
                            index,
                            "suggestedLines",
                            event.target.value.split("\n").slice(0, 3)
                          )
                        }
                        placeholder={'"That makes sense…"\n"Can I ask…"'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Checkpoints */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Checkpoints{" "}
                  <span className="font-normal text-gray-400">— pass/fail moments</span>
                  <HelpTip>
                    Discrete <b>yes/no</b> milestones the trainee should hit (e.g. "asks for a next
                    step"). Required checkpoints block passing when missed. Link a checkpoint to a
                    rubric category when both measure the same skill so their grades stay coherent.
                    They're never revealed to the trainee mid-call.
                  </HelpTip>
                </span>
                <button
                  type="button"
                  onClick={() => addRow("checkpoints", emptyCheckpoint)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus size={15} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.checkpoints.map((cp, i) => (
                  <div key={cp.id || i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex gap-2 items-start">
                      <input
                        className={`${inputCls} flex-[2]`}
                        value={cp.name}
                        onChange={(e) => updateArr("checkpoints", i, "name", e.target.value)}
                        placeholder="Name (e.g. Asks for a next step)"
                      />
                      <input
                        className={`${inputCls} flex-[3]`}
                        value={cp.description}
                        onChange={(e) => updateArr("checkpoints", i, "description", e.target.value)}
                        placeholder="What counts as hitting it (fed to the grader)"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow("checkpoints", i)}
                        className="text-gray-400 hover:text-red-500 p-2"
                        aria-label="Remove checkpoint"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cp.required !== false}
                        onClick={() => updateArr("checkpoints", i, "required", cp.required === false)}
                        className="inline-flex items-center gap-2 text-xs font-medium text-gray-600"
                      >
                        <span
                          className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                            cp.required !== false
                              ? "justify-end bg-blue-600"
                              : "justify-start bg-gray-300"
                          }`}
                        >
                          <span className="h-4 w-4 rounded-full bg-white shadow" />
                        </span>
                        Required to pass
                      </button>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                        Linked rubric
                        <select
                          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={cp.rubricKey || ""}
                          onChange={(e) => updateArr("checkpoints", i, "rubricKey", e.target.value)}
                        >
                          <option value="">None</option>
                          {rubricOptions.map((category) => (
                            <option key={category.key} value={category.key}>
                              {category.key} — {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rubric */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Rubric <span className="font-normal text-gray-400">— points, 0–20 each</span>
                  <HelpTip>
                    Graded <b>quality</b> dimensions (up to 5). Each scores 0–20; they sum and
                    scale to the overall score out of 100. The passing score is configured above.
                    The description is exactly what the grader reads, so be specific about what
                    "good" looks like.
                  </HelpTip>
                </span>
                <button
                  type="button"
                  onClick={() => addRow("rubric", emptyRubricRow, 5)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                  disabled={form.rubric.length >= 5}
                >
                  <Plus size={15} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.rubric.map((c, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-xs text-gray-400 font-mono mt-2.5 w-6 shrink-0">
                      c{i + 1}
                    </span>
                    <input
                      className={`${inputCls} flex-[2]`}
                      value={c.label}
                      onChange={(e) => updateArr("rubric", i, "label", e.target.value)}
                      placeholder="Category (e.g. Objection Handling)"
                    />
                    <input
                      className={`${inputCls} flex-[3]`}
                      value={c.description}
                      onChange={(e) => updateArr("rubric", i, "description", e.target.value)}
                      placeholder="What 'good' looks like (fed to the grader)"
                    />
                    <button
                      type="button"
                      onClick={() => removeRubricRow(i)}
                      className="text-gray-400 hover:text-red-500 p-2"
                      aria-label="Remove rubric category"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Tuning */}
          <Section title="Tuning" hint="Call timing and model behavior. Sensible defaults are fine.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Silence timeout (s)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.knobs?.silenceTimeoutSeconds ?? 30}
                  onChange={(e) =>
                    set("knobs", {
                      ...form.knobs,
                      silenceTimeoutSeconds: Number(e.target.value) || 30,
                    })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Max duration (s)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={form.knobs?.maxDurationSeconds ?? 600}
                  onChange={(e) =>
                    set("knobs", { ...form.knobs, maxDurationSeconds: Number(e.target.value) || 600 })
                  }
                />
              </div>
              <div>
                <label className={labelCls}>
                  Temperature
                  <HelpTip>
                    How loose vs. consistent the prospect's replies are (0–2). Lower = more
                    predictable, higher = more varied/spontaneous. 0.6 is a good default.
                  </HelpTip>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  className={inputCls}
                  value={form.knobs?.temperature ?? 0.6}
                  onChange={(e) =>
                    set("knobs", { ...form.knobs, temperature: Number(e.target.value) || 0.6 })
                  }
                />
              </div>
            </div>
          </Section>
          </>
        ) : (
          <Section
            title="Advanced template"
            hint="These reusable sections wrap every scenario's persona. Edits here save to THIS scenario only — other scenarios keep the defaults. Blank a box to fall back to the default."
          >
            {TEMPLATE_BLOCKS.map((b) => {
              const cur = form.templateOverrides?.[b.key];
              const overridden =
                typeof cur === "string" && cur.trim() && cur.trim() !== b.default.trim();
              return (
                <div key={b.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls + " mb-0"}>
                      <span className="font-mono text-blue-600">[{b.header}]</span>{" "}
                      <span className="font-normal text-gray-400">— {b.hint}</span>
                    </label>
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => resetTpl(b.key)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <RotateCcw size={12} /> Reset to default
                      </button>
                    )}
                  </div>
                  <textarea
                    className={`${inputCls} font-mono text-xs leading-relaxed`}
                    style={{ minHeight: `${b.rows * 1.5 + 1.25}rem` }}
                    value={form.templateOverrides?.[b.key] ?? b.default}
                    onChange={(e) => setTpl(b.key, e.target.value)}
                  />
                  {overridden && (
                    <p className="text-[11px] text-amber-600 mt-1">Customized for this scenario only.</p>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
              The behavioral sections — difficulty, conversation arc, hard rules, hang-up, and
              grading — are managed automatically (and follow the toggles on the Scenario tab), so
              they aren't editable here.
            </p>
          </Section>
        )}
        </div>

      {previewOpen && (
        <PromptPreview
          scenario={{ ...cleanedScenario(), id: form.id || "new-scenario" }}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};
