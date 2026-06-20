"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  Check,
  DollarSign,
  Globe2,
  Instagram,
  Mail,
  Phone,
  Plus,
  Search,
  User,
  Users
} from "lucide-react";

import { RubricSelector } from "./RubricSelector";
import { contactCard, propertyTour } from "./contact-card-data";

type SmartSessionFormProps = {
  mode?: "inline" | "modal" | "page";
  onDone?: () => void;
  onCancel?: () => void;
};

const sourceOptions = [
  { value: "Website", label: "Website", icon: Globe2, note: "Came through the property site or landing page." },
  { value: "Referral", label: "Referral", icon: Users, note: "Friend, resident, or team referral." },
  { value: "Instagram", label: "Instagram", icon: Instagram, note: "Social post, story, or DM." },
  { value: "Search", label: "Search", icon: Search, note: "Google, map search, or apartment marketplace." },
  { value: "Walk-in", label: "Walk-in", icon: Building2, note: "Arrived at the property without an appointment." }
];

const budgetOptions = [
  { value: "Under $1,400", label: "Under $1.4k", icon: DollarSign, note: "Price sensitive, likely needs concessions." },
  { value: "$1,400-$1,800", label: "$1.4k-$1.8k", icon: DollarSign, note: "Core range for many studio or 1-bed leads." },
  { value: "$1,800-$2,300", label: "$1.8k-$2.3k", icon: DollarSign, note: "Open to upgraded floor plans or better views." },
  { value: "$2,300+", label: "$2.3k+", icon: DollarSign, note: "Likely considering premium units." },
  { value: "Flexible", label: "Flexible", icon: DollarSign, note: "Budget depends on fit, timing, or specials." }
];

const moveInOptions = ["Not sure yet", "ASAP", "Within 30 days", "1-3 months", "3+ months"];
const interestOptions = ["Studio", "1 bed", "2 bed", "Parking", "Amenities", "Pet friendly"];

export function SmartSessionForm({ mode = "inline", onDone, onCancel }: SmartSessionFormProps) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState(() => new Date());
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [moveInWindow, setMoveInWindow] = useState("");
  const [interestsSelected, setInterestsSelected] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [interests, setInterests] = useState("");
  const [rubricId, setRubricId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inferredTitle = buildSessionTitle({
    leadName,
    propertyName: propertyTour.name,
    agentName: contactCard.name,
    scheduledAt
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLeadName = leadName.trim();
    if (!normalizedLeadName) {
      setError("Lead name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const notes = [
      "Lead intake",
      `Leasing agent: ${contactCard.name}`,
      `Property: ${propertyTour.name}`,
      `Lead name: ${normalizedLeadName}`,
      phone.trim() ? `Phone: ${phone.trim()}` : null,
      email.trim() ? `Email: ${email.trim()}` : null,
      source.trim() ? `Heard from: ${source.trim()}` : null,
      sourceNote.trim() ? `Heard from note: ${sourceNote.trim()}` : null,
      moveInWindow ? `Move-in timing: ${moveInWindow}` : null,
      interestsSelected.length ? `Interested in: ${interestsSelected.join(", ")}` : null,
      budget.trim() ? `Budget: ${budget.trim()}` : null,
      budgetNote.trim() ? `Budget note: ${budgetNote.trim()}` : null,
      interests.trim() ? `Notes / preferences: ${interests.trim()}` : null
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: inferredTitle,
          scheduledAt: scheduledAt.toISOString(),
          prospectName: normalizedLeadName,
          location: propertyTour.name,
          notes,
          rubricId
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to create session.");
      }

      const body = await response.json() as { session: { id: string } };
      onDone?.();
      router.push(`/sessions/${body.session.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
      setSaving(false);
    }
  }

  function toggleInterest(value: string) {
    setInterestsSelected((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  return (
    <form onSubmit={handleSubmit} className={`smart-session-form smart-session-form--${mode}`}>
      <div className="smart-session-time-field">
        <button
          type="button"
          className="smart-session-inferred"
          aria-expanded={timePickerOpen}
          aria-controls={`${mode}-scheduledAt-popover`}
          onClick={() => setTimePickerOpen((open) => !open)}
        >
          <span>{isSameMinute(scheduledAt, new Date()) ? "Defaulting to now" : "Scheduled for"}</span>
          <strong>{formatDateTime(scheduledAt)}</strong>
          <span>{contactCard.name} · {propertyTour.name}</span>
        </button>
        {timePickerOpen && (
          <div id={`${mode}-scheduledAt-popover`} className="smart-session-time-popover">
            <label htmlFor={`${mode}-scheduledAt`} className="form-label">Date &amp; time</label>
            <input
              id={`${mode}-scheduledAt`}
              type="datetime-local"
              className="form-input"
              value={formatDateTimeInput(scheduledAt)}
              onChange={(event) => {
                const nextDate = new Date(event.target.value);
                if (!Number.isNaN(nextDate.getTime())) {
                  setScheduledAt(nextDate);
                }
              }}
            />
            <div className="smart-session-time-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScheduledAt(new Date())}>
                Now
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTimePickerOpen(false)}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="smart-session-contact-grid">
        <div className="form-group">
          <label htmlFor={`${mode}-leadName`} className="form-label">Lead name</label>
          <input
            id={`${mode}-leadName`}
            value={leadName}
            onChange={(event) => setLeadName(event.target.value)}
            type="text"
            className="form-input"
            placeholder="Jordan Lee"
            autoComplete="name"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${mode}-phone`} className="form-label">Phone number</label>
          <div className="smart-session-input-icon">
            <Phone size={16} />
            <input
              id={`${mode}-phone`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              className="form-input"
              placeholder="(313) 555-0199"
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor={`${mode}-email`} className="form-label">Email</label>
          <div className="smart-session-input-icon">
            <Mail size={16} />
            <input
              id={`${mode}-email`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              className="form-input"
              placeholder="jordan@example.com"
              autoComplete="email"
            />
          </div>
        </div>
      </div>

      <details className="smart-session-optional">
        <summary>+ Optional Fields</summary>
        <div className="form-grid smart-session-grid">
          <div className="form-group smart-session-wide">
            <span className="form-label">Heard from</span>
            <div className="smart-session-option-grid smart-session-source-options">
              {sourceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="smart-session-option"
                    data-selected={source === option.value}
                    aria-pressed={source === option.value}
                    onClick={() => setSource((current) => current === option.value ? "" : option.value)}
                  >
                    <Icon size={18} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.note}</small>
                    </span>
                    {source === option.value && <Check size={16} />}
                  </button>
                );
              })}
            </div>
            <textarea
              id={`${mode}-sourceNote`}
              value={sourceNote}
              onChange={(event) => setSourceNote(event.target.value)}
              rows={2}
              className="form-textarea"
              placeholder="Add details about the campaign, person, search term, or context..."
            />
          </div>

          <div className="form-group smart-session-wide">
            <span className="form-label">Move-in timing</span>
            <div className="smart-session-pill-row">
              {moveInOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="smart-session-pill"
                  data-selected={(moveInWindow || "Not sure yet") === option}
                  onClick={() => setMoveInWindow(option === "Not sure yet" ? "" : option)}
                >
                  <CalendarClock size={15} />
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group smart-session-wide">
            <span className="form-label">Budget</span>
            <div className="smart-session-option-grid smart-session-budget-options">
              {budgetOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="smart-session-option"
                    data-selected={budget === option.value}
                    onClick={() => setBudget(option.value)}
                  >
                    <Icon size={18} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.note}</small>
                    </span>
                    {budget === option.value && <Check size={16} />}
                  </button>
                );
              })}
            </div>
            <textarea
              id={`${mode}-budgetNote`}
              value={budgetNote}
              onChange={(event) => setBudgetNote(event.target.value)}
              rows={2}
              className="form-textarea"
              placeholder="Mention flexibility, concessions, max rent, fees, or parking budget..."
            />
          </div>

          <div className="form-group smart-session-wide">
            <span className="form-label">Interested in</span>
            <div className="smart-session-pill-row">
              {interestOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="smart-session-pill"
                  data-selected={interestsSelected.includes(option)}
                  onClick={() => toggleInterest(option)}
                >
                  <User size={15} />
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group smart-session-wide">
            <label htmlFor={`${mode}-interests`} className="form-label">Prospect notes</label>
            <textarea
              id={`${mode}-interests`}
              value={interests}
              onChange={(event) => setInterests(event.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Pets, roommates, must-haves, objections, follow-up reminders..."
            />
          </div>
        </div>
      </details>

      <RubricSelector value={rubricId} onChange={setRubricId} />

      <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: -4 }}>
        After creating, you can record or upload the tour on the session page.
      </p>

      <div className="smart-session-preview">
        <span>Session title</span>
        <strong>{inferredTitle}</strong>
      </div>

      {error && <p className="create-error">{error}</p>}

      <div className="smart-session-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Back
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Creating..." : "Create session"}
        </button>
      </div>
    </form>
  );
}

export function SmartSessionModalButton({
  label = "+",
  title = "New Session"
}: {
  label?: string;
  title?: string;
}) {
  return (
    <Link href="/new" className="btn btn-primary btn-sm smart-session-plus" aria-label={title}>
      <Plus size={14} />
      <span>{label}</span>
    </Link>
  );
}

function buildSessionTitle({
  leadName,
  propertyName,
  agentName,
  scheduledAt
}: {
  leadName: string;
  propertyName: string;
  agentName: string;
  scheduledAt: Date;
}) {
  const name = leadName.trim();
  return [
    "New Tour",
    name || null,
    propertyName,
    agentName,
    formatTitleDate(scheduledAt)
  ].filter(Boolean).join(" - ");
}

function formatTitleDate(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDateTimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function isSameMinute(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 60_000;
}
