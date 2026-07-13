import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Globe2, Mail, MessageCircle, Phone, Play, UserRound } from "lucide-react";

import type { AnalysisResult, FollowUpAction, SessionDetail, SessionLead } from "@tour/shared";
import { listVisibleMaterials, type Material } from "@/lib/materials";
import { getRepCard, type RepCard } from "@/lib/reps";
import { getAnalysisBySessionId, getSessionById, listFollowUpActions } from "@/lib/sessions";

import styles from "./follow-up.module.css";

export const dynamic = "force-dynamic";

type FollowUpPageProps = {
  params: Promise<{ id: string }>;
};

type FollowUpMedia = {
  title: string;
  description: string;
  imageUrl: string | null;
  href: string;
  kind: "tour" | "photo" | "link";
};

export async function generateMetadata({ params }: FollowUpPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) {
    return { title: "Tour follow-up" };
  }

  const repCard = getSessionRepCard(session);
  const propertyName = repCard?.property.name ?? session.location ?? "your tour";
  const title = `${propertyName} follow-up`;
  const description = `Your tour recap, helpful links, and next steps${session.prospectName ? ` for ${session.prospectName}` : ""}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website"
    },
    twitter: {
      card: "summary",
      title,
      description
    }
  };
}

export default async function FollowUpPage({ params }: FollowUpPageProps) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) notFound();

  const [analysis, actions, materials] = await Promise.all([
    getAnalysisBySessionId(id),
    listFollowUpActions(id),
    listVisibleMaterials(session.propertyId ?? undefined)
  ]);

  const repCard = getSessionRepCard(session);
  const lead = session.leads?.[0] ?? null;
  const propertyName = repCard?.property.name ?? session.location ?? "the property";
  const firstName = lead?.firstName || firstToken(session.prospectName) || firstToken(lead?.name) || "there";
  const media = buildMedia({ session, repCard, materials });
  const links = buildLinks({ repCard, sessionId: id });
  const details = buildDetails({ session, lead, propertyName });
  const steps = buildSteps(actions);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMedia}>
          {repCard?.property.mediaUrl ? (
            <video src={repCard.property.mediaUrl} autoPlay muted loop playsInline preload="metadata" />
          ) : media[0]?.imageUrl ? (
            <img src={media[0].imageUrl} alt="" />
          ) : null}
        </div>

        <div className={styles.heroContent}>
          <div className={styles.brandRow}>
            <div className={styles.brand}>leasemagnets</div>
            <div className={styles.pill}>
              <span className={styles.dot} />
              Tour follow-up
            </div>
          </div>

          <div>
            <p className={styles.eyebrow}>{propertyName}</p>
            <h1 className={styles.title}>{firstName}, here is your tour recap.</h1>
            <p className={styles.message}>
              Thanks for spending time with us. I gathered the key details, useful media, and next links in one place so
              it is easy to come back to later.
            </p>
          </div>

          {repCard && (
            <div className={styles.contactStrip}>
              <div className={styles.agent}>
                <div className={styles.avatar}>{repCard.rep.initials}</div>
                <div>
                  <div className={styles.agentName}>{repCard.rep.name}</div>
                  <div className={styles.agentMeta}>
                    {repCard.rep.title} · {repCard.rep.company}
                  </div>
                </div>
              </div>
              <div className={styles.contactActions}>
                <a className={styles.button} href={`sms:${repCard.rep.phoneValue}`}>
                  <MessageCircle size={16} />
                  Text
                </a>
                <a className={styles.ghostButton} href={`tel:${repCard.rep.phoneValue}`}>
                  <Phone size={16} />
                  Call
                </a>
                <a className={styles.ghostButton} href={`mailto:${repCard.rep.email}`}>
                  <Mail size={16} />
                  Email
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.summaryCard}>
          <div>
            <h2 className={styles.cardTitle}>Core summary</h2>
            <p className={styles.cardText}>{buildSummary({ analysis, propertyName, firstName })}</p>
          </div>
          <div className={styles.detailGrid}>
            {details.map((detail) => (
              <div key={detail.label} className={styles.detail}>
                <div className={styles.detailLabel}>{detail.label}</div>
                <div className={styles.detailValue}>{detail.value}</div>
              </div>
            ))}
          </div>
        </section>

        {media.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Media from the tour</h2>
                <p className={styles.sectionSub}>Photos, videos, and visual references worth saving.</p>
              </div>
            </div>
            <div className={styles.mediaGrid}>
              {media.map((item) => (
                <a key={`${item.kind}-${item.href}-${item.title}`} className={styles.mediaCard} href={item.href}>
                  <div className={styles.mediaThumb}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" />
                    ) : (
                      <div className={styles.mediaFallback}>
                        <Play size={32} />
                      </div>
                    )}
                  </div>
                  <div className={styles.mediaBody}>
                    <div className={styles.mediaName}>{item.title}</div>
                    <div className={styles.mediaMeta}>{item.description}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Helpful links</h2>
              <p className={styles.sectionSub}>The links you are most likely to need after the tour.</p>
            </div>
          </div>
          <div className={styles.linkGrid}>
            {links.map((link) => (
              <a key={link.label} className={styles.linkCard} href={link.href}>
                <span className={styles.linkIcon}>{link.icon}</span>
                <span>
                  <span className={styles.linkLabel}>{link.label}</span>
                  <span className={styles.linkHint}>{link.hint}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        {steps.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Next steps</h2>
                <p className={styles.sectionSub}>A short list to keep the decision moving without digging through texts.</p>
              </div>
            </div>
            <div className={styles.steps}>
              {steps.map((step) => (
                <div key={step.title} className={styles.step}>
                  <div className={styles.stepTitle}>{step.title}</div>
                  <div className={styles.stepText}>{step.description}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={styles.footer}>This page is a simple recap for your tour. Reply to your leasing contact with any questions.</div>
      </div>
    </main>
  );
}

function getSessionRepCard(session: SessionDetail): RepCard | null {
  const repSlug = session.leads?.find((lead) => lead.repSlug)?.repSlug;
  return getRepCard(repSlug ?? "amulya") ?? getRepCard("alex");
}

function buildSummary({
  analysis,
  propertyName,
  firstName
}: {
  analysis: AnalysisResult | null;
  propertyName: string;
  firstName: string;
}) {
  const cleanSummary = analysis?.summary && isProspectSafeSummary(analysis.summary)
    ? truncateWords(analysis.summary, 70)
    : null;
  if (cleanSummary) return cleanSummary;
  return `${firstName}, thanks again for touring ${propertyName}. This page keeps the main recap, photos and videos, and the links you may want next in one easy place.`;
}

function isProspectSafeSummary(summary: string) {
  const internalTerms = [
    "agent",
    "coaching",
    "fair housing",
    "failed",
    "missed",
    "performance",
    "rubric",
    "score",
    "transcript"
  ];
  const lower = summary.toLowerCase();
  return !internalTerms.some((term) => lower.includes(term));
}

function truncateWords(value: string, maxWords: number) {
  return value.split(/\s+/).slice(0, maxWords).join(" ");
}

function buildDetails({
  session,
  lead,
  propertyName
}: {
  session: SessionDetail;
  lead: SessionLead | null;
  propertyName: string;
}) {
  const answers = lead?.questionAnswers ?? {};
  return [
    { label: "Property", value: propertyName },
    { label: "Tour date", value: formatDate(session.scheduledAt ?? session.createdAt) },
    { label: "Move-in", value: answers.move_in ?? "Not specified yet" },
    { label: "Floor plan", value: answers.floor_plan ?? "Open to options" }
  ];
}

function buildMedia({
  session,
  repCard,
  materials
}: {
  session: SessionDetail;
  repCard: RepCard | null;
  materials: Material[];
}): FollowUpMedia[] {
  const propertyMedia = repCard?.property.mediaUrl
    ? [
        {
          title: `${repCard.property.name} overview`,
          description: "A quick visual reference from the property tour.",
          imageUrl: null,
          href: repCard.property.mediaUrl,
          kind: "tour" as const
        }
      ]
    : [];

  const materialMedia = materials
    .filter((material) => material.media?.videoUrl || material.media?.iframeUrl || material.fileUrl)
    .slice(0, 5)
    .map((material) => ({
      title: material.name,
      description: material.description || "Helpful tour resource.",
      imageUrl: material.media?.imageUrl ?? material.media?.gifUrl ?? null,
      href: material.media?.iframeUrl ?? material.media?.videoUrl ?? material.fileUrl ?? "#",
      kind: "link" as const
    }));

  return [...propertyMedia, ...materialMedia].filter((item) => item.href !== "#").slice(0, 6);
}

function buildLinks({ repCard, sessionId }: { repCard: RepCard | null; sessionId: string }) {
  const rep = repCard?.rep;
  const links = [
    rep?.website
      ? { label: "Website", hint: rep.websiteDisplay ?? rep.website, href: rep.website, icon: <Globe2 size={18} /> }
      : null,
    rep
      ? { label: "Text contact", hint: rep.phoneDisplay, href: `sms:${rep.phoneValue}`, icon: <MessageCircle size={18} /> }
      : null,
    rep ? { label: "Email contact", hint: rep.email, href: `mailto:${rep.email}`, icon: <Mail size={18} /> } : null,
    rep
      ? { label: "Tour check-in", hint: "Open the tour contact card", href: `/p/${rep.slug}`, icon: <UserRound size={18} /> }
      : null,
    { label: "Session reference", hint: "Save this recap link", href: `/follow-up/${sessionId}`, icon: <ExternalLink size={18} /> }
  ];

  return links.filter((link): link is NonNullable<(typeof links)[number]> => link !== null).slice(0, 4);
}

function buildSteps(actions: FollowUpAction[]) {
  if (actions.length > 0) {
    return actions.slice(0, 3).map((action) => ({
      title: action.title,
      description: action.suggestedMessage ?? action.description
    }));
  }

  return [
    {
      title: "Review the media",
      description: "Save any photos, videos, or floor plan links that help you compare options."
    },
    {
      title: "Send questions back",
      description: "Reply to your leasing contact with timing, budget, or floor plan questions."
    }
  ];
}

function firstToken(value?: string | null) {
  return value?.trim().split(/\s+/)[0] ?? null;
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatSeconds(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const min = Math.floor(rounded / 60);
  const sec = String(rounded % 60).padStart(2, "0");
  return `${min}:${sec}`;
}
