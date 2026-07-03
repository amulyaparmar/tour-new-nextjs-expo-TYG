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
const BRAND = "#24205a";
const BRAND_DARK = "#16133d";
const PAPER = "#f8fafc";
const LINE = "#dbe3ef";
const GREEN = "#10b981";

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
        background: `linear-gradient(135deg, ${ACCENT}, #7c3aed)`,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 800,
        boxShadow: "0 18px 44px rgba(79, 70, 229, 0.32)"
      }}
    >
      {rep.initials}
    </div>
  );
}

function ContactLines({ rep }: { rep: RepCard["rep"] }) {
  const items = [rep.phoneDisplay, rep.email].filter(Boolean) as string[];

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      {items.map((line) => (
        <div
          key={line}
          style={{
            display: "flex",
            padding: "9px 13px",
            borderRadius: 999,
            border: `1px solid ${LINE}`,
            background: PAPER,
            color: MUTED,
            fontSize: 20,
            fontWeight: 720
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function propertyPosterUrl(mediaUrl: string): string {
  const cleanUrl = mediaUrl.split("#")[0]?.split("?")[0] ?? mediaUrl;
  if (/\.(mp4|mov|webm)$/i.test(cleanUrl)) {
    return cleanUrl.replace(/\.(mp4|mov|webm)$/i, ".jpg");
  }
  return cleanUrl;
}

function PropertyLayout({ card }: { card: RepCard }) {
  const { rep, property } = card;
  const gallery = property.galleryImageUrls?.length ? property.galleryImageUrls : [propertyPosterUrl(property.mediaUrl)];
  const [primaryImage, secondaryImage, tertiaryImage] = gallery;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, #111032 0%, #24205a 46%, #3b2ea2 100%)",
        fontFamily: "Inter, sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(circle at 78% 18%, rgba(255,255,255,.28), rgba(255,255,255,0) 34%), linear-gradient(90deg, rgba(15, 13, 44, 0.54), rgba(15, 13, 44, 0.06))"
        }}
      />

      <div style={{ position: "absolute", right: 48, top: 108, width: 420, display: "flex", flexDirection: "column", gap: 16 }}>
        {primaryImage && (
          <div
            style={{
              width: 420,
              height: 240,
              borderRadius: 30,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.38)",
              display: "flex"
            }}
          >
            <img src={primaryImage} width={420} height={240} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
        <div style={{ display: "flex", gap: 16 }}>
          {[secondaryImage, tertiaryImage].filter(Boolean).map((image) => (
            <div
              key={image}
              style={{
                width: 202,
                height: 150,
                borderRadius: 26,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.35)",
                display: "flex"
              }}
            >
              <img src={image as string} width={202} height={150} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          color: "white",
          margin: "48px 48px 0"
        }}
      >
        <div style={{ display: "flex", fontSize: 28, fontWeight: 850, letterSpacing: 0.2 }}>leasemagnets</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.28)",
            background: "rgba(255,255,255,.13)",
            padding: "10px 15px"
          }}
        >
          <div style={{ width: 9, height: 9, borderRadius: 99, background: GREEN, display: "flex" }} />
          <div style={{ display: "flex", fontSize: 18, fontWeight: 820 }}>Tour check-in</div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          color: "white",
          maxWidth: 690,
          gap: 18,
          margin: "10px 48px 0"
        }}
      >
        <div style={{ display: "flex", fontSize: 22, fontWeight: 800, opacity: 0.72, textTransform: "uppercase" }}>
          Property tour
        </div>
        <div style={{ display: "flex", fontSize: 74, lineHeight: 0.94, fontWeight: 880 }}>{property.name}</div>
        <div style={{ display: "flex", fontSize: 24, lineHeight: 1.28, fontWeight: 620, opacity: 0.86, maxWidth: 610 }}>
          Your contact card and tour details, saved in one place for quick follow-up.
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(255,255,255,.96)",
          borderRadius: 34,
          padding: "30px 34px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 28,
          border: "1px solid rgba(255,255,255,.72)",
          margin: "0 48px 48px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ padding: 7, borderRadius: 999, background: "white", border: `1px solid ${LINE}`, display: "flex" }}>
            <Avatar rep={rep} size={108} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", fontSize: 42, lineHeight: 1, fontWeight: 860, color: INK }}>{rep.name}</div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 650, color: MUTED }}>
              {rep.title} · {rep.company}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, maxWidth: 520 }}>
          <ContactLines rep={rep} />
          <div style={{ display: "flex", fontSize: 18, fontWeight: 800, color: MUTED }}>Reply STOP to opt out</div>
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
        gap: 28,
        background: `linear-gradient(180deg, ${PAPER}, #ffffff)`,
        fontFamily: "Inter, sans-serif",
        padding: 64
      }}
    >
      <div style={{ position: "absolute", top: 48, display: "flex", fontSize: 28, fontWeight: 850, color: BRAND }}>
        leasemagnets
      </div>
      <Avatar rep={rep} size={200} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 880, color: INK }}>{rep.name}</div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: MUTED }}>
          {rep.title} · {rep.company}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8 }}>
        {[rep.phoneDisplay, rep.email, rep.websiteDisplay ?? rep.website]
          .filter(Boolean)
          .map((line) => (
            <div key={line as string} style={{ display: "flex", fontSize: 30, color: MUTED, fontWeight: 650 }}>
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
