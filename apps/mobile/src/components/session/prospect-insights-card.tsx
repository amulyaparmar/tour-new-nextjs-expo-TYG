import {
  normalizeProspectInsights,
  PROSPECT_INTEREST_CATEGORY_LABELS,
  type AnalysisResult,
  type ProspectInterestCoverage,
  type SessionCustomerInterest,
} from "@tour/shared";
import { ArrowUpRight, CircleAlert, HeartHandshake, Target } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const COVERAGE: Record<ProspectInterestCoverage, { label: string; color: string; background: string }> = {
  addressed: { label: "Addressed", color: "#067647", background: "#ecfdf3" },
  partially_addressed: { label: "Partly addressed", color: "#b54708", background: "#fffaeb" },
  missed: { label: "Missed", color: "#b42318", background: "#fef3f2" },
  not_discussed: { label: "Not discussed", color: "#667085", background: "#f2f4f7" },
};

export function ProspectInsightsCard({
  analysis,
  providedInterests = [],
}: {
  analysis: AnalysisResult;
  providedInterests?: SessionCustomerInterest[];
}) {
  const insights = normalizeProspectInsights(analysis.prospectInsights);
  const hasProvidedInterests = providedInterests.length > 0;
  const hasInsights = Boolean(
    insights && (insights.summary || insights.interests.length || insights.conversionDrivers.length || insights.nextBestAction),
  );

  if (!hasProvidedInterests && !hasInsights) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.iconWrap}><Icon as={HeartHandshake} size={18} color="#006ce5" /></View>
        <View style={styles.copy}>
          <Text style={styles.title}>Prospect understanding</Text>
          <Text style={styles.emptyText}>Prospect needs will appear here once they are captured or inferred from the conversation.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}><Icon as={HeartHandshake} size={18} color="#006ce5" /></View>
        <View style={styles.copy}>
          <Text style={styles.title}>Prospect understanding</Text>
          <Text style={styles.subtitle}>What matters to them, and how the tour responded</Text>
        </View>
        {insights?.intentStage && insights.intentStage !== "unknown" ? (
          <View style={styles.intentBadge}>
            <Text style={styles.intentText}>{insights.intentStage}</Text>
          </View>
        ) : null}
      </View>

      {insights?.summary ? <Text style={styles.summary}>{insights.summary}</Text> : null}

      {providedInterests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Provided before the session</Text>
          <View style={styles.chips}>
            {providedInterests.map((interest) => (
              <View key={interest.id} style={styles.providedChip}>
                <Text style={styles.providedChipText} numberOfLines={1}>
                  {interest.detail || PROSPECT_INTEREST_CATEGORY_LABELS[interest.category]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {insights?.interests.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Needs and response</Text>
          <View style={styles.interestList}>
            {insights.interests.map((interest, index) => {
              const coverage = COVERAGE[interest.coverage];
              return (
                <View key={`${interest.category}-${interest.detail}-${index}`} style={styles.interestRow}>
                  <View style={styles.interestHeader}>
                    <Text style={styles.interestTitle} numberOfLines={2}>{interest.detail}</Text>
                    <View style={[styles.coverageBadge, { backgroundColor: coverage.background }]}>
                      <Text style={[styles.coverageText, { color: coverage.color }]}>{coverage.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.category}>{PROSPECT_INTEREST_CATEGORY_LABELS[interest.category]}</Text>
                  {interest.agentResponse ? (
                    <Text style={styles.response} numberOfLines={3}>{interest.agentResponse}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {insights?.conversionDrivers.length ? (
        <View style={styles.driverRow}>
          <Icon as={Target} size={16} color="#006ce5" />
          <View style={styles.copy}>
            <Text style={styles.driverLabel}>Likely to convert with</Text>
            <Text style={styles.driverText}>{insights.conversionDrivers.join(" · ")}</Text>
          </View>
        </View>
      ) : null}

      {insights?.objections.length ? (
        <View style={styles.objectionRow}>
          <Icon as={CircleAlert} size={16} color="#b54708" />
          <View style={styles.copy}>
            <Text style={styles.driverLabel}>Open concerns</Text>
            <Text style={styles.driverText}>{insights.objections.join(" · ")}</Text>
          </View>
        </View>
      ) : null}

      {insights?.nextBestAction ? (
        <View style={styles.nextAction}>
          <Icon as={ArrowUpRight} size={16} color="#fff" />
          <View style={styles.copy}>
            <Text style={styles.nextLabel}>Next best action</Text>
            <Text style={styles.nextText}>{insights.nextBestAction}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#fff" },
  emptyCard: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff" },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconWrap: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#eff6ff" },
  copy: { flex: 1, minWidth: 0 },
  title: { color: "#101828", fontSize: 16, fontWeight: "900" },
  subtitle: { marginTop: 2, color: "#667085", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  emptyText: { marginTop: 4, color: "#667085", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  intentBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#eaf2ff" },
  intentText: { color: "#005fcc", fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  summary: { color: "#344054", fontSize: 14, lineHeight: 21, fontWeight: "600" },
  section: { gap: 8 },
  sectionLabel: { color: "#667085", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.55 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  providedChip: { maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: "#eff6ff" },
  providedChipText: { color: "#175cd3", fontSize: 12, fontWeight: "800" },
  interestList: { gap: 8 },
  interestRow: { gap: 3, padding: 11, borderRadius: 12, backgroundColor: "#f8fafc" },
  interestHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  interestTitle: { flex: 1, color: "#1d2939", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  coverageBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  coverageText: { fontSize: 9, fontWeight: "900" },
  category: { color: "#667085", fontSize: 11, fontWeight: "700" },
  response: { marginTop: 3, color: "#475467", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  driverRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 11, borderRadius: 12, backgroundColor: "#f5faff" },
  objectionRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 11, borderRadius: 12, backgroundColor: "#fffaeb" },
  driverLabel: { color: "#475467", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.45 },
  driverText: { marginTop: 3, color: "#344054", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  nextAction: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 13, backgroundColor: "#006ce5" },
  nextLabel: { color: "#dbeafe", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.45 },
  nextText: { marginTop: 2, color: "#fff", fontSize: 13, lineHeight: 19, fontWeight: "800" },
});
