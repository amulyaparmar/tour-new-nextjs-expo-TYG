"use client";

import {
  normalizeProspectInsights,
  participantNameWithoutConfidenceMarker,
  PROSPECT_INTEREST_CATEGORY_LABELS,
  type AnalysisResult,
  type ProspectInterestCoverage,
  type ProspectInterestInsight,
  type ProspectInsights,
  type SessionCustomerInterest,
  type SessionLead,
} from "@tour/shared";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Mail,
  Phone,
  Target,
  UserRoundSearch,
} from "lucide-react";

import styles from "./SessionProspectPanel.module.css";

type Props = {
  analysis: AnalysisResult;
  prospectName: string | null;
  leads: SessionLead[];
  customerInterests: SessionCustomerInterest[];
  onSeek: (seconds: number) => void;
};

type DisplayInterest = ProspectInterestInsight & {
  key: string;
};

const COVERAGE_LABELS: Record<ProspectInterestCoverage, string> = {
  addressed: "Addressed",
  partially_addressed: "Partially addressed",
  missed: "Not addressed",
  not_discussed: "Not discussed",
};

export function SessionProspectPanel({
  analysis,
  prospectName,
  leads,
  customerInterests,
  onSeek,
}: Props) {
  const insights = normalizeProspectInsights(analysis.prospectInsights);
  const interests = mergeCustomerInterests(customerInterests, insights?.interests ?? []);
  const cleanProspectName = participantNameWithoutConfidenceMarker(prospectName);
  const lead =
    leads.find((candidate) =>
      cleanProspectName
      && candidate.name.trim().toLowerCase() === cleanProspectName.trim().toLowerCase()
    )
    ?? leads[0]
    ?? null;
  const displayName = cleanProspectName || lead?.name.trim() || "Prospect";
  const knownContext = buildKnownContext(lead);
  const coverage = summarizeCoverage(interests);

  return (
    <div className={styles.panel}>
      <header className={styles.profile} aria-labelledby="prospect-panel-heading">
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">{initials(displayName)}</div>
          <div className={styles.identityCopy}>
            <span className={styles.eyebrow}>Prospect</span>
            <h2 className={styles.name} id="prospect-panel-heading">{displayName}</h2>
          </div>
          <span className={`${styles.stage} ${stageClass(insights?.intentStage)}`}>
            {stageLabel(insights?.intentStage)}
          </span>
        </div>

        <p className={styles.summary}>
          {insights?.summary || "Customer priorities and how they were handled in this session."}
        </p>

        {insights?.intentRationale ? (
          <div className={styles.intentNote}>
            <strong>Intent signal</strong>
            <span>{insights.intentRationale}</span>
          </div>
        ) : null}

        {lead?.email || lead?.phone ? (
          <div className={styles.contactRow} aria-label="Prospect contact details">
            {lead.email ? (
              <span>
                <Mail size={12} aria-hidden="true" />
                {lead.email}
              </span>
            ) : null}
            {lead.phone ? (
              <span>
                <Phone size={12} aria-hidden="true" />
                {lead.phone}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className={styles.section} aria-labelledby="prospect-interests-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h3 id="prospect-interests-heading">Interests</h3>
            <p>Known priorities and additional needs identified in the conversation.</p>
          </div>
          {interests.length > 0 ? <span>{interests.length}</span> : null}
        </div>

        {interests.length > 0 ? (
          <>
            <div className={styles.coverageSummary} aria-label="Interest coverage summary">
              <div className={styles.coverageTrack} aria-hidden="true">
                <span
                  className={styles.coverageTrackAddressed}
                  style={{ width: `${coverage.addressedPercent}%` }}
                />
                <span
                  className={styles.coverageTrackPartial}
                  style={{ width: `${coverage.partialPercent}%` }}
                />
              </div>
              <div className={styles.coverageLegend}>
                <span><i className={styles.legendAddressed} />{coverage.addressed} addressed</span>
                <span><i className={styles.legendPartial} />{coverage.partial} partial</span>
                <span><i className={styles.legendOpen} />{coverage.open} open</span>
              </div>
            </div>

            <div className={styles.interestList}>
              {interests.map((interest) => (
                <article className={styles.interest} key={interest.key}>
                  <div className={styles.interestHeader}>
                    <div className={styles.interestMeta}>
                      <span className={styles.category}>
                        {PROSPECT_INTEREST_CATEGORY_LABELS[interest.category]}
                      </span>
                      <span className={styles.source}>{sourceLabel(interest.source)}</span>
                    </div>
                    <span className={`${styles.coverageBadge} ${coverageClass(interest.coverage)}`}>
                      {COVERAGE_LABELS[interest.coverage]}
                    </span>
                  </div>

                  <p className={styles.interestDetail}>{interest.detail}</p>

                  <div className={styles.response}>
                    <span className={styles.responseIcon} aria-hidden="true">
                      {interest.coverage === "addressed" ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <AlertCircle size={15} />
                      )}
                    </span>
                    <div>
                      <strong>How it was addressed</strong>
                      <p>{responseCopy(interest)}</p>
                    </div>
                  </div>

                  {interest.evidence ? (
                    <details className={styles.evidence}>
                      <summary>
                        <span>Conversation evidence</span>
                        {interest.timestamp ? <span>{interest.timestamp}</span> : null}
                        <ChevronDown size={13} aria-hidden="true" />
                      </summary>
                      <div className={styles.evidenceBody}>
                        {interest.timestamp ? (
                          <button
                            type="button"
                            onClick={() => onSeek(timestampToSeconds(interest.timestamp!))}
                            aria-label={`Play evidence at ${interest.timestamp}`}
                          >
                            {interest.timestamp}
                          </button>
                        ) : null}
                        <p>&ldquo;{interest.evidence}&rdquo;</p>
                      </div>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyInterests}>
            <UserRoundSearch size={18} aria-hidden="true" />
            <div>
              <strong>No customer interests captured</strong>
              <p>Add interests when creating the session, or re-analyze to identify them from the conversation.</p>
            </div>
          </div>
        )}
      </section>

      {insights?.nextBestAction ? (
        <section className={styles.followUp} aria-labelledby="recommended-follow-up-heading">
          <span className={styles.followUpIcon} aria-hidden="true"><Target size={15} /></span>
          <div>
            <h3 id="recommended-follow-up-heading">Recommended follow-up</h3>
            <p>{insights.nextBestAction}</p>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
        </section>
      ) : null}

      {insights?.objections.length ? (
        <section className={styles.section} aria-labelledby="open-concerns-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h3 id="open-concerns-heading">Open concerns</h3>
              <p>Items that may still prevent the prospect from moving forward.</p>
            </div>
          </div>
          <ul className={styles.concernList}>
            {insights.objections.map((objection) => (
              <li key={objection}>
                <AlertCircle size={14} aria-hidden="true" />
                <span>{objection}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {knownContext.length ? (
        <details className={styles.context}>
          <summary>
            <span>Check-in context</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <dl>
            {knownContext.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}

function mergeCustomerInterests(
  provided: SessionCustomerInterest[],
  analyzed: ProspectInterestInsight[],
): DisplayInterest[] {
  const usedAnalyzed = new Set<number>();
  const providedRows = provided.map((customerInterest) => {
    const exactIndex = analyzed.findIndex((interest, index) => (
      !usedAnalyzed.has(index)
      && interest.category === customerInterest.category
      && normalizedInterest(interest.detail) === normalizedInterest(customerInterest.detail)
    ));
    const providedSourceIndex = analyzed.findIndex((interest, index) => (
      !usedAnalyzed.has(index)
      && interest.category === customerInterest.category
      && interest.source === "provided"
    ));
    const analyzedIndex = exactIndex >= 0 ? exactIndex : providedSourceIndex;
    if (analyzedIndex >= 0) {
      usedAnalyzed.add(analyzedIndex);
      return {
        ...analyzed[analyzedIndex]!,
        key: `provided-${customerInterest.id}`,
        detail: customerInterest.detail,
        source: "provided" as const,
      };
    }
    return {
      key: `provided-${customerInterest.id}`,
      category: customerInterest.category,
      detail: customerInterest.detail,
      importance: "medium" as const,
      source: "provided" as const,
      evidence: "",
      timestamp: null,
      agentResponse: "",
      coverage: "not_discussed" as const,
    };
  });

  const additionalRows = analyzed.flatMap((interest, index) => (
    usedAnalyzed.has(index)
      ? []
      : [{ ...interest, key: `analyzed-${interest.category}-${normalizedInterest(interest.detail)}-${index}` }]
  ));

  return [...providedRows, ...additionalRows];
}

function summarizeCoverage(interests: DisplayInterest[]) {
  const addressed = interests.filter((interest) => interest.coverage === "addressed").length;
  const partial = interests.filter((interest) => interest.coverage === "partially_addressed").length;
  const open = interests.length - addressed - partial;
  const total = Math.max(1, interests.length);
  return {
    addressed,
    partial,
    open,
    addressedPercent: (addressed / total) * 100,
    partialPercent: (partial / total) * 100,
  };
}

function responseCopy(interest: DisplayInterest) {
  if (interest.agentResponse.trim()) return interest.agentResponse.trim();
  if (interest.coverage === "not_discussed" && interest.source === "provided") {
    return "This known interest did not come up in the session.";
  }
  if (interest.coverage === "missed") {
    return "The conversation raised this interest, but the agent did not clearly address it.";
  }
  if (interest.coverage === "partially_addressed") {
    return "The agent acknowledged this interest, but the response did not fully resolve it.";
  }
  if (interest.coverage === "addressed") {
    return "The agent addressed this interest during the session.";
  }
  return "The conversation does not show a clear response to this interest.";
}

function normalizedInterest(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceLabel(source: ProspectInterestInsight["source"]) {
  if (source === "provided") return "Added before session";
  if (source === "stated") return "From conversation";
  return "Inferred";
}

function buildKnownContext(lead: SessionLead | null) {
  if (!lead) return [];
  const details: Array<{ label: string; value: string }> = [];
  if (lead.reason?.trim()) details.push({ label: "Reason for visit", value: lead.reason.trim() });
  if (lead.jobTitle?.trim()) details.push({ label: "Role", value: lead.jobTitle.trim() });
  if (lead.notes?.trim()) details.push({ label: "Team notes", value: lead.notes.trim() });
  for (const [question, answer] of Object.entries(lead.questionAnswers ?? {})) {
    if (!answer.trim()) continue;
    details.push({ label: humanizeKey(question), value: answer.trim() });
  }
  return details.slice(0, 8);
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
}

function timestampToSeconds(timestamp: string) {
  const [minutes, seconds] = timestamp.split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function stageLabel(stage: ProspectInsights["intentStage"] | undefined) {
  if (stage === "ready") return "Ready";
  if (stage === "considering") return "Considering";
  if (stage === "exploring") return "Exploring";
  return "Intent unknown";
}

function stageClass(stage: ProspectInsights["intentStage"] | undefined) {
  if (stage === "ready") return styles.stageReady;
  if (stage === "considering") return styles.stageConsidering;
  if (stage === "exploring") return styles.stageExploring;
  return styles.stageUnknown;
}

function coverageClass(coverage: ProspectInterestCoverage) {
  if (coverage === "addressed") return styles.coverageAddressed;
  if (coverage === "partially_addressed") return styles.coveragePartial;
  if (coverage === "missed") return styles.coverageMissed;
  return styles.coverageNeutral;
}
