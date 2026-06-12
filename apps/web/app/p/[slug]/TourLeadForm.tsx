"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Loader2, Mail, Phone, UserRound, Video } from "lucide-react";
import { contactCard, propertyTour } from "../../(app)/contact-card-data";

export function TourLeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [wantsSummary, setWantsSummary] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          email: String(fd.get("email") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          wantsSummary,
          propertyName: propertyTour.name
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField({
    name,
    label,
    icon,
    type,
    placeholder,
    required,
    autoComplete,
    inputMode
  }: {
    name: string;
    label: string;
    icon: ReactNode;
    type: string;
    placeholder: string;
    required?: boolean;
    autoComplete?: string;
    inputMode?: "email" | "tel";
  }) {
    const isFocused = focusedField === name;
    return (
      <label style={{ ...styles.fieldCard, ...(isFocused ? styles.fieldCardFocused : {}) }}>
        <span style={{ ...styles.fieldIcon, ...(isFocused ? styles.fieldIconFocused : {}) }} aria-hidden="true">
          {icon}
        </span>
        <span style={styles.fieldBody}>
          <span style={styles.fieldLabel}>{label}</span>
          <input
            name={name}
            type={type}
            required={required}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            style={styles.fieldInput}
            onFocus={() => setFocusedField(name)}
            onBlur={() => setFocusedField(null)}
          />
        </span>
      </label>
    );
  }

  if (submitted) {
    return (
      <div style={styles.page}>
        <SuccessCard />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <main style={styles.shell}>
        <section style={styles.hero}>
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            src={propertyTour.mediaUrl}
            style={styles.heroVideo}
          />
          <div style={styles.heroOverlay} />
          <div style={styles.heroContent}>
            <div>
              <div style={styles.propertyLabel}>Property tour</div>
              <h1 style={styles.propertyName}>{propertyTour.name}</h1>
            </div>
            <img
              src="/images/tour logo TYG dark.svg"
              alt="Tour"
              width="118"
              height="34"
              style={{ width: 118, height: "auto" }}
            />
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.agentRow}>
            <span style={styles.avatar} aria-hidden="true">
              {contactCard.initials}
            </span>
            <div>
              <div style={styles.agentName}>{contactCard.name}</div>
              <div style={styles.agentMeta}>
                {contactCard.title} · {contactCard.company}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            {renderField({
              name: "name",
              label: "Full name",
              icon: <UserRound size={19} />,
              type: "text",
              placeholder: "Your name",
              required: true,
              autoComplete: "name"
            })}

            {renderField({
              name: "email",
              label: "Email",
              icon: <Mail size={19} />,
              type: "email",
              placeholder: "you@example.com",
              required: true,
              autoComplete: "email",
              inputMode: "email"
            })}

            {renderField({
              name: "phone",
              label: "Phone",
              icon: <Phone size={19} />,
              type: "tel",
              placeholder: "(555) 000-0000",
              autoComplete: "tel",
              inputMode: "tel"
            })}

            <label style={styles.checkboxRow}>
              <input
                name="wantsSummary"
                type="checkbox"
                checked={wantsSummary}
                onChange={(event) => setWantsSummary(event.target.checked)}
                style={styles.checkbox}
              />
              <span>
                <strong style={{ color: "#111827" }}>Send me a recorded tour summary</strong>
                <span style={styles.checkboxHelp}>
                  Include notes, next steps, and a recap from this property tour.
                </span>
              </span>
            </label>

            {error && <p style={styles.errorText} role="alert">{error}</p>}

            <button type="submit" disabled={submitting} style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}>
              {submitting
                ? <Loader2 size={18} aria-hidden="true" style={{ animation: "spin 1s linear infinite" }} />
                : <Video size={18} aria-hidden="true" />}
              {submitting ? "Sending..." : "Request tour follow-up"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function SuccessCard() {
  return (
    <main style={styles.shell}>
      <section style={{ ...styles.card, textAlign: "center", padding: 28 }}>
        <CheckCircle2 size={42} color="#16a34a" aria-hidden="true" style={{ margin: "0 auto 12px" }} />
        <h1 style={{ ...styles.agentName, fontSize: 22 }}>You're all set</h1>
        <p style={{ color: "#64748b", fontSize: 14, marginTop: 8 }}>
          {contactCard.name} has your info and can follow up with the tour summary.
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    padding: "20px"
  },
  shell: {
    width: "100%",
    maxWidth: 480,
    margin: "0 auto"
  },
  hero: {
    minHeight: 178,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    background: "#1e1b4b",
    boxShadow: "0 1px 3px rgba(15,23,42,.08)"
  },
  heroVideo: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(30, 27, 75, .68)"
  },
  heroContent: {
    position: "relative",
    zIndex: 1,
    minHeight: 178,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: 20
  },
  propertyLabel: {
    color: "rgba(255,255,255,.78)",
    fontSize: 13,
    fontWeight: 700
  },
  propertyName: {
    color: "white",
    fontSize: 30,
    lineHeight: 1.08,
    fontWeight: 800,
    marginTop: 4
  },
  card: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    boxShadow: "0 1px 3px rgba(15,23,42,.08)",
    padding: 18,
    marginTop: 14
  },
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    background: "#4f46e5",
    color: "white",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 18,
    flexShrink: 0
  },
  agentName: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a"
  },
  agentMeta: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 1
  },
  form: {
    display: "grid",
    gap: 14,
    marginTop: 18
  },
  fieldCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minHeight: 68,
    border: "1.5px solid #e2e8f0",
    borderRadius: 16,
    padding: "12px 16px",
    background: "white",
    cursor: "text",
    transition: "border-color .15s ease, box-shadow .15s ease"
  },
  fieldCardFocused: {
    borderColor: "#4f46e5",
    boxShadow: "0 0 0 4px rgba(79,70,229,.12)"
  },
  fieldIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#64748b",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    transition: "background .15s ease, color .15s ease"
  },
  fieldIconFocused: {
    background: "#eef2ff",
    color: "#4f46e5"
  },
  fieldBody: {
    display: "grid",
    gap: 2,
    flex: 1,
    minWidth: 0
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: ".02em",
    textTransform: "uppercase",
    color: "#64748b"
  },
  fieldInput: {
    width: "100%",
    minWidth: 0,
    border: 0,
    outline: 0,
    padding: 0,
    font: "inherit",
    fontSize: 17,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#0f172a",
    background: "transparent"
  },
  errorText: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "#dc2626"
  },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    border: "1px solid #c7d2fe",
    background: "#eef2ff",
    borderRadius: 12,
    padding: 12,
    fontSize: 13
  },
  checkbox: {
    width: 18,
    height: 18,
    marginTop: 1,
    accentColor: "#4f46e5",
    flexShrink: 0
  },
  checkboxHelp: {
    display: "block",
    color: "#64748b",
    marginTop: 2,
    lineHeight: 1.35
  },
  button: {
    height: 54,
    border: 0,
    borderRadius: 14,
    background: "#4f46e5",
    color: "white",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    font: "inherit",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer"
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: "default"
  }
} satisfies Record<string, React.CSSProperties>;
