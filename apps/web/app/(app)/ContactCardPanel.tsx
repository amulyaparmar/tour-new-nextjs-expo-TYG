import Link from "next/link";
import type { ReactNode } from "react";
import { Download, Globe2, Mail, Phone, Plus, QrCode, Send, UserRound } from "lucide-react";

export const contactCard = {
  name: "Alex Johnson",
  initials: "A",
  title: "Sales Agent",
  company: "Tour.video",
  phoneDisplay: "(313) 555-0148",
  phoneValue: "+13135550148",
  email: "alex@tour.video",
  websiteDisplay: "tour.you/p/alex",
  website: "https://tour.you/p/alex"
};

const propertyTour = {
  name: "27 North",
  mediaUrl:
    "https://storage.googleapis.com/leasemagnets---dummy-db.appspot.com/community/44/intro_revamp_intro/27_North_intro_2024_mp4_1.mp4#t=8"
};

const contactVcard = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Johnson;Alex;;;",
  `FN:${contactCard.name}`,
  `ORG:${contactCard.company}`,
  `TITLE:${contactCard.title}`,
  `TEL;TYPE=CELL:${contactCard.phoneValue}`,
  `EMAIL:${contactCard.email}`,
  `URL:${contactCard.website}`,
  "END:VCARD"
].join("\n");

const encodedContactCard = encodeURIComponent(contactVcard);
const contactCardDownloadUrl = `data:text/vcard;charset=utf-8,${encodedContactCard}`;
const contactCardQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=12&format=svg&data=${encodedContactCard}`;
const contactCardShareUrl = `mailto:?subject=${encodeURIComponent(`${contactCard.name} contact card`)}&body=${encodeURIComponent(
  `${contactCard.name}\n${contactCard.title}, ${contactCard.company}\n${contactCard.phoneDisplay}\n${contactCard.email}\n${contactCard.website}`
)}`;

type ContactCardPanelProps = {
  id: string;
  variant?: "home" | "profile";
};

export function ContactCardPanel({ id, variant = "profile" }: ContactCardPanelProps) {
  const isHome = variant === "home";

  return (
    <section className="card" aria-labelledby={id} style={{ marginBottom: isHome ? 20 : 12 }}>
      {isHome ? (
        <div
          style={{
            minHeight: 124,
            background: "var(--indigo-950)",
            color: "white",
            position: "relative",
            overflow: "hidden",
            padding: 18,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16
          }}
        >
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            src={propertyTour.mediaUrl}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(30, 27, 75, .66)"
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 id={id} style={{ fontSize: 18, fontWeight: 800, color: "white" }}>
              {propertyTour.name}
            </h2>
            <div style={{ marginTop: 2, fontSize: 12, color: "rgba(255,255,255,.78)", fontWeight: 600 }}>
              Property tour
            </div>
            <Link
              href="/materials"
              aria-label="Add property media"
              style={{
                marginTop: 22,
                width: 42,
                height: 42,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(255,255,255,.3)",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,.08)"
              }}
            >
              <Plus size={20} aria-hidden="true" />
            </Link>
          </div>
          <img
            src="/images/tour logo TYG dark.svg"
            alt="Tour"
            width="132"
            height="38"
            style={{ width: 132, height: "auto", marginTop: 8, position: "relative", zIndex: 1 }}
          />
        </div>
      ) : (
        <div className="card-header">
          <h2 id={id}>Contact Card</h2>
          <span className="badge badge-analysis_ready" style={{ gap: 4 }}>
            <QrCode size={12} aria-hidden="true" />
            QR ready
          </span>
        </div>
      )}

      <div
        className="card-body"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: isHome ? 20 : 16,
          padding: isHome ? "18px 16px" : undefined
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: isHome ? 44 : 38,
                height: isHome ? 44 : 38,
                borderRadius: isHome ? "var(--radius-full)" : "var(--radius-md)",
                background: isHome ? "var(--indigo-600)" : "var(--slate-100)",
                color: isHome ? "white" : "var(--indigo-600)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0
              }}
            >
              {isHome ? contactCard.initials : <UserRound size={18} />}
            </span>
            <div>
              <div style={{ fontSize: isHome ? 18 : 15, fontWeight: 700, color: "var(--slate-900)" }}>
                {contactCard.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 1 }}>
                {contactCard.title} · {contactCard.company}
              </div>
            </div>
          </div>

          <div aria-label="Contact details" style={{ display: "grid", gap: 7, marginTop: 14 }}>
            <ContactCardDetail href={`tel:${contactCard.phoneValue}`} icon={<Phone size={15} aria-hidden="true" />}>
              {contactCard.phoneDisplay}
            </ContactCardDetail>
            <ContactCardDetail href={`mailto:${contactCard.email}`} icon={<Mail size={15} aria-hidden="true" />}>
              {contactCard.email}
            </ContactCardDetail>
            {isHome && (
              <ContactCardDetail href={contactCard.website} icon={<Globe2 size={15} aria-hidden="true" />}>
                {contactCard.websiteDisplay}
              </ContactCardDetail>
            )}
          </div>

          <a
            href={isHome ? contactCardShareUrl : contactCardDownloadUrl}
            download={isHome ? undefined : "alex-johnson-contact.vcf"}
            className={`btn ${isHome ? "btn-primary" : "btn-outline"}`}
            style={{ marginTop: 15 }}
          >
            {isHome ? <Send size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            {isHome ? "Share contact" : "Save contact"}
          </a>
        </div>

        <div
          style={{
            width: isHome ? 172 : 156,
            height: isHome ? 172 : 156,
            maxWidth: "100%",
            display: "grid",
            placeItems: "center",
            border: "1px solid var(--slate-200)",
            borderRadius: "var(--radius-md)",
            background: "white",
            padding: 8,
            flex: "0 0 auto"
          }}
        >
          <img
            src={contactCardQrUrl}
            alt={`QR code for ${contactCard.name}'s contact card`}
            width="196"
            height="196"
            style={{ width: isHome ? 156 : 140, height: isHome ? 156 : 140 }}
          />
        </div>
      </div>
    </section>
  );
}

function ContactCardDetail({
  children,
  href,
  icon
}: {
  children: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        color: "var(--slate-600)",
        fontSize: 13
      }}
    >
      <span style={{ color: "var(--slate-400)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </span>
    </a>
  );
}
