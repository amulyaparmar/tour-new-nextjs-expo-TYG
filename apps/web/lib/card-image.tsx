import { ImageResponse } from "next/og";

import type { RepCard } from "@/lib/reps";

/**
 * Shared renderer for the rep tour card as an OG/MMS image. Two layouts:
 *  - "property": branded dark card with property name + rep identity + contact.
 *  - "rep": cleaner rep-focused digital business card.
 *
 * Both are 1200x630 (standard OG ratio). Used by the public card image endpoint
 * and the /p/[slug] opengraph-image so link previews and MMS attachments share
 * one source of truth.
 */
export type CardLayout = "property" | "rep";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function normalizeLayout(value: string | null | undefined): CardLayout {
  return value === "rep" ? "rep" : "property";
}

const INK = "#0f172a";
const MUTED = "#64748b";
const ACCENT = "#4f46e5";

function Avatar({ rep, size }: { rep: RepCard["rep"]; size: number }) {
  if (rep.avatarUrl) {
    return (
      <img
        src={rep.avatarUrl}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: size, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: ACCENT,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 800
      }}
    >
      {rep.initials}
    </div>
  );
}

function ContactLines({ rep }: { rep: RepCard["rep"] }) {
  const items = [rep.phoneDisplay, rep.email, rep.websiteDisplay ?? rep.website].filter(Boolean) as string[];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((line) => (
        <div key={line} style={{ fontSize: 30, color: MUTED, fontWeight: 600 }}>
          {line}
        </div>
      ))}
    </div>
  );
}

function PropertyLayout({ card }: { card: RepCard }) {
  const { rep, property } = card;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#1e1b4b",
        fontFamily: "Inter, sans-serif"
      }}
    >
      {/* Top brand band */}
      <div
        style={{
          height: 240,
          padding: "40px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: "white"
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, opacity: 0.85 }}>leasemagnets</div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, opacity: 0.7 }}>Property tour</div>
          <div style={{ fontSize: 64, fontWeight: 800, marginTop: 4 }}>{property.name}</div>
        </div>
      </div>

      {/* White info panel with overlapping avatar */}
      <div
        style={{
          flex: 1,
          background: "white",
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          padding: "56px 56px 48px",
          display: "flex",
          flexDirection: "column",
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", top: -72, left: 56, display: "flex" }}>
          <div style={{ padding: 8, background: "white", borderRadius: 999, display: "flex" }}>
            <Avatar rep={rep} size={128} />
          </div>
        </div>
        <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 52, fontWeight: 800, color: INK }}>{rep.name}</div>
            <div style={{ fontSize: 30, fontWeight: 600, color: MUTED }}>
              {rep.title} · {rep.company}
            </div>
          </div>
          <ContactLines rep={rep} />
        </div>
      </div>
    </div>
  );
}

function RepLayout({ card }: { card: RepCard }) {
  const { rep } = card;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 32,
        background: "white",
        fontFamily: "Inter, sans-serif",
        padding: 64
      }}
    >
      <div style={{ position: "absolute", top: 48, fontSize: 28, fontWeight: 700, color: MUTED }}>leasemagnets</div>
      <Avatar rep={rep} size={200} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 60, fontWeight: 800, color: INK }}>{rep.name}</div>
        <div style={{ fontSize: 32, fontWeight: 600, color: MUTED }}>
          {rep.title} · {rep.company}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 8 }}>
        {[rep.phoneDisplay, rep.email, rep.websiteDisplay ?? rep.website]
          .filter(Boolean)
          .map((line) => (
            <div key={line as string} style={{ fontSize: 30, color: MUTED, fontWeight: 600 }}>
              {line}
            </div>
          ))}
      </div>
    </div>
  );
}

export function renderCardImage(card: RepCard, layout: CardLayout): ImageResponse {
  return new ImageResponse(layout === "rep" ? <RepLayout card={card} /> : <PropertyLayout card={card} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT
  });
}
