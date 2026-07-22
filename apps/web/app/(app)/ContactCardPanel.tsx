"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Download, Globe2, Mail, Pencil, Phone, Plus, QrCode, Send, UserRound } from "lucide-react";
import {
  contactCard,
  propertyTour as fallbackPropertyTour,
} from "./contact-card-data";

type QrMode = "tour" | "offline";

type ContactCardPanelProps = {
  id: string;
  variant?: "home" | "profile";
  contact?: typeof contactCard;
  property?: {
    name: string;
    mediaUrl?: string | null;
    mediaKind?: "video" | "image";
  };
};

export function ContactCardPanel({ id, variant = "profile", contact, property }: ContactCardPanelProps) {
  const [qrMode, setQrMode] = useState<QrMode>("tour");
  const isHome = variant === "home";
  const activeContact = contact ?? contactCard;
  const activeProperty = property ?? fallbackPropertyTour;
  const propertyMediaUrl = activeProperty.mediaUrl?.trim() ?? "";
  const propertyMediaKind = activeProperty.mediaKind
    ?? (propertyMediaUrl && !/\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(propertyMediaUrl) ? "video" : "image");
  const qr = useMemo(() => {
    const contactVcard = vCardFor(activeContact);
    if (qrMode === "offline") {
      return {
        alt: `QR code for ${activeContact.name}'s offline contact card`,
        caption: "Offline contact card",
        src: qrCodeUrl(contactVcard)
      };
    }

    return {
      alt: `QR code for ${activeContact.name}'s tour request form`,
      caption: "Tour request form",
      src: qrCodeUrl(tourRequestUrl(activeContact.website))
    };
  }, [activeContact, qrMode]);
  const contactDownloadUrl = `data:text/vcard;charset=utf-8,${encodeURIComponent(vCardFor(activeContact))}`;

  return (
    <section className="card" aria-labelledby={id} style={{ marginBottom: isHome ? 20 : 12 }}>
      {isHome ? (
        <div
          style={{
            minHeight: 124,
            background: "linear-gradient(115deg, #eef7ff 0%, #cfe6ff 48%, #a9d0fb 100%)",
            color: "var(--slate-900)",
            position: "relative",
            overflow: "hidden",
            padding: 18,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16
          }}
        >
          {propertyMediaUrl && propertyMediaKind === "video" && (
            <video
              aria-hidden="true"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              src={propertyMediaUrl}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
            />
          )}
          {propertyMediaUrl && propertyMediaKind === "image" && (
            <img
              aria-hidden="true"
              alt=""
              src={propertyMediaUrl}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
            />
          )}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: propertyMediaUrl
                ? "linear-gradient(105deg, rgba(228,242,255,.94) 0%, rgba(111,170,232,.72) 58%, rgba(205,230,255,.88) 100%)"
                : "linear-gradient(105deg, rgba(255,255,255,.28), rgba(77,138,229,.12))"
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 id={id} style={{ fontSize: 18, fontWeight: 800, color: "var(--slate-900)" }}>
              {activeProperty.name}
            </h2>
            <div style={{ marginTop: 2, fontSize: 12, color: "var(--slate-600)", fontWeight: 650 }}>
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
                border: "1px solid rgba(23,51,95,.18)",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,.48)",
                color: "var(--indigo-700)",
                boxShadow: "0 8px 20px rgba(33,73,133,.10)"
              }}
            >
              <Plus size={20} aria-hidden="true" />
            </Link>
          </div>
          <img
            src="/images/tour logo TYG.svg"
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
              {isHome ? activeContact.initials : <UserRound size={18} />}
            </span>
            <div>
              <div style={{ fontSize: isHome ? 18 : 15, fontWeight: 700, color: "var(--slate-900)" }}>
                {activeContact.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 1 }}>
                {activeContact.title} · {activeContact.company}
              </div>
            </div>
          </div>

          <div aria-label="Contact details" style={{ display: "grid", gap: 7, marginTop: 14 }}>
            <ContactCardDetail href={`tel:${activeContact.phoneValue}`} icon={<Phone size={15} aria-hidden="true" />}>
              {activeContact.phoneDisplay}
            </ContactCardDetail>
            <ContactCardDetail href={`mailto:${activeContact.email}`} icon={<Mail size={15} aria-hidden="true" />}>
              {activeContact.email}
            </ContactCardDetail>
            {isHome && (
              <ContactCardDetail
                href={activeContact.website}
                icon={<Globe2 size={15} aria-hidden="true" />}
                editHref="/profile#public-check-in-link"
              >
                {activeContact.websiteDisplay}
              </ContactCardDetail>
            )}
          </div>

          <a
            href={isHome ? activeContact.localPath : contactDownloadUrl}
            target={isHome ? "_blank" : undefined}
            rel={isHome ? "noopener noreferrer" : undefined}
            download={isHome ? undefined : `${activeContact.localPath.split("/").filter(Boolean).pop() || "tour-contact"}.vcf`}
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
  editHref,
  href,
  icon
}: {
  children: string;
  editHref?: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <span className="contact-card-detail-row">
      <a href={href} className="contact-card-detail-link">
        <span style={{ color: "var(--slate-400)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {children}
        </span>
      </a>
      {editHref ? (
        <Link
          href={editHref}
          className="contact-card-detail-edit"
          aria-label="Edit public check-in link"
          title="Edit public check-in link"
        >
          <Pencil size={13} aria-hidden="true" />
        </Link>
      ) : null}
    </span>
  );
}

function vCardFor(contact: typeof contactCard) {
  const parts = contact.name.trim().split(/\s+/).filter(Boolean);
  const family = parts.length > 1 ? parts.at(-1) ?? "" : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${family};${given};;;`,
    `FN:${contact.name}`,
    `ORG:${contact.company}`,
    `TITLE:${contact.title}`,
    `TEL;TYPE=CELL:${contact.phoneValue}`,
    `EMAIL:${contact.email}`,
    `URL:${contact.website}`,
    "END:VCARD",
  ].join("\n");
}

function tourRequestUrl(website: string) {
  try {
    const origin = typeof window === "undefined" ? "https://tour.you" : window.location.origin;
    const url = new URL(website, origin);
    url.searchParams.set("check-in", "true");
    return url.toString();
  } catch {
    return website;
  }
}

function qrCodeUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=12&format=svg&data=${encodeURIComponent(value)}`;
}
