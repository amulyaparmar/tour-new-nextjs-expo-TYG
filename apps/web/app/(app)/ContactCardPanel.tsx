"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Download, Globe2, Mail, Phone, Plus, QrCode, Send, UserRound } from "lucide-react";
import {
  contactCard,
  contactCardDownloadUrl,
  contactCardShareUrl,
  offlineContactCardQrUrl,
  propertyTour,
  tourRequestQrUrl
} from "./contact-card-data";

type QrMode = "tour" | "offline";

type ContactCardPanelProps = {
  id: string;
  variant?: "home" | "profile";
};

export function ContactCardPanel({ id, variant = "profile" }: ContactCardPanelProps) {
  const [qrMode, setQrMode] = useState<QrMode>("tour");
  const isHome = variant === "home";
  const qr = useMemo(() => {
    if (qrMode === "offline") {
      return {
        alt: `QR code for ${contactCard.name}'s offline contact card`,
        caption: "Offline contact card",
        src: offlineContactCardQrUrl
      };
    }

    return {
      alt: `QR code for ${contactCard.name}'s tour request form`,
      caption: "Tour request form",
      src: tourRequestQrUrl
    };
  }, [qrMode]);

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

        <div style={{ flex: "0 0 auto", maxWidth: "100%" }}>
          <div
            role="group"
            aria-label="QR code mode"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              borderRadius: "var(--radius-md)",
              background: "var(--slate-100)",
              padding: 4,
              marginBottom: 8
            }}
          >
            <QrToggleButton active={qrMode === "tour"} onClick={() => setQrMode("tour")}>
              Tour request
            </QrToggleButton>
            <QrToggleButton active={qrMode === "offline"} onClick={() => setQrMode("offline")}>
              Offline card
            </QrToggleButton>
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
              padding: 8
            }}
          >
            <img
              src={qr.src}
              alt={qr.alt}
              width="196"
              height="196"
              style={{ width: isHome ? 156 : 140, height: isHome ? 156 : 140 }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--slate-400)", fontWeight: 600, marginTop: 6, textAlign: "center" }}>
            {qr.caption}
          </div>
        </div>
      </div>
    </section>
  );
}

function QrToggleButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        borderRadius: "var(--radius-sm)",
        background: active ? "white" : "transparent",
        color: active ? "var(--indigo-600)" : "var(--slate-500)",
        boxShadow: active ? "0 1px 2px rgba(15,23,42,.08)" : "none",
        fontSize: 11,
        fontWeight: 700,
        padding: "6px 8px",
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </button>
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
