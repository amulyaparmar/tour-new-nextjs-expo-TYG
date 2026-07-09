import { Ionicons } from "@expo/vector-icons";
import type { AnalysisResult } from "@tour/shared";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import { selectionHaptic } from "@/lib/haptics";
import { tourEnter } from "@/theme/animations";
import { scoreColor, tourColors } from "@/theme/tour-brand";

function weakestSectionName(sections: AnalysisResult["sectionScores"]) {
  if (!sections.length) return null;
  return sections.reduce((min, sec) => (sec.score < min.score ? sec : min)).section;
}

export function RubricTab({ analysis }: { analysis: AnalysisResult }) {
  const focusSection = useMemo(() => weakestSectionName(analysis.sectionScores), [analysis.sectionScores]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    analysis.sectionScores.forEach((s) => {
      init[s.section] = s.section === focusSection;
    });
    return init;
  });

  const expandedCount = Object.values(expanded).filter(Boolean).length;

  return (
    <View style={st.root}>
      <Reanimated.View entering={tourEnter.fadeDown} style={st.header}>
        <Ionicons name="clipboard-outline" size={18} color={tourColors.brand} />
        <Text style={st.headerTitle}>Question breakdown</Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            selectionHaptic();
            const next = expandedCount < analysis.sectionScores.length;
            const update: Record<string, boolean> = {};
            analysis.sectionScores.forEach((s) => {
              update[s.section] = next;
            });
            setExpanded(update);
          }}
          style={st.expandBtn}
        >
          <Text style={st.expandBtnText}>
            {expandedCount < analysis.sectionScores.length ? "Expand all" : "Collapse all"}
          </Text>
        </Button>
      </Reanimated.View>

      {analysis.sectionScores.map((sec, sectionIndex) => {
        const c = scoreColor(sec.score);
        const hasQ = sec.questions?.length > 0;
        const exp = expanded[sec.section] ?? false;
        const passCount = hasQ ? sec.questions.filter((q) => q.passed).length : 0;
        const isFocus = sec.section === focusSection;

        return (
          <Reanimated.View key={sec.section} entering={tourEnter.stagger(sectionIndex, 60)}>
            <Card style={[st.sectionCard, { borderLeftWidth: 4, borderLeftColor: c }]}>
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  setExpanded((p) => ({ ...p, [sec.section]: !p[sec.section] }));
                }}
                style={({ pressed }) => [st.sectionHeader, pressed && st.pressed]}
              >
                <View style={st.sectionCopy}>
                  <View style={st.sectionTitleRow}>
                    <Text selectable style={st.sectionTitle}>{sec.section}</Text>
                    {isFocus ? (
                      <Badge variant="secondary" style={st.focusBadge}>
                        <Text style={st.focusBadgeText}>Focus</Text>
                      </Badge>
                    ) : null}
                  </View>
                  {hasQ ? (
                    <Text style={st.passMeta}>{passCount}/{sec.questions.length} passed</Text>
                  ) : null}
                </View>
                <View style={st.sectionRight}>
                  {sec.pointsPossible > 0 ? (
                    <Text selectable style={st.sectionPtsMeta}>
                      {sec.pointsEarned}/{sec.pointsPossible}
                    </Text>
                  ) : null}
                  <Badge variant="outline" style={[st.scoreBadge, { backgroundColor: `${c}18` }]}>
                    <Text selectable style={[st.scoreBadgeText, { color: c }]}>{sec.score}%</Text>
                  </Badge>
                  <Ionicons name={exp ? "chevron-up" : "chevron-down"} size={16} color={tourColors.textMuted} />
                </View>
              </Pressable>

              {exp && hasQ ? (
                <Reanimated.View entering={FadeInDown.duration(220)}>
                  {sec.questions.map((q, qi) => (
                    <Reanimated.View key={q.id} entering={tourEnter.stagger(qi, 35)} style={st.questionRow}>
                      <View style={st.questionMain}>
                        <View
                          style={[
                            st.questionIcon,
                            { backgroundColor: q.passed ? tourColors.greenBg : tourColors.redBg },
                          ]}
                        >
                          <Ionicons
                            name={q.passed ? "checkmark" : "close"}
                            size={14}
                            color={q.passed ? tourColors.green : tourColors.red}
                          />
                        </View>
                        <View style={st.questionBody}>
                          <View style={st.questionTop}>
                            <Text selectable style={st.questionText}>
                              <Text style={st.questionId}>{q.id} </Text>
                              {q.question}
                            </Text>
                            <Badge
                              variant="outline"
                              style={[
                                st.questionPtsBadge,
                                { backgroundColor: q.passed ? tourColors.greenBg : tourColors.redBg },
                              ]}
                            >
                              <Text
                                selectable
                                style={[
                                  st.questionPtsText,
                                  { color: q.passed ? tourColors.green : tourColors.red },
                                ]}
                              >
                                {q.earnedPoints}/{q.maxPoints}
                              </Text>
                            </Badge>
                          </View>
                          {q.evidence ? (
                            <View style={st.evidenceBox}>
                              <Text selectable style={st.evidenceText}>"{q.evidence}"</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Reanimated.View>
                  ))}
                </Reanimated.View>
              ) : null}

              {exp && !hasQ ? (
                <CardContent style={st.emptySection}>
                  <Text style={st.emptySectionText}>
                    Section scored at {sec.score}%
                    {sec.pointsPossible > 0 ? ` (${sec.pointsEarned}/${sec.pointsPossible} pts)` : ""}.
                  </Text>
                </CardContent>
              ) : null}
            </Card>
          </Reanimated.View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  root: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: "900", color: UIColors.foreground },
  expandBtn: { minHeight: 32, paddingHorizontal: 8 },
  expandBtnText: { fontSize: 11, fontWeight: "800", color: UIColors.primary },
  sectionCard: { overflow: "hidden", borderColor: UIColors.border, paddingVertical: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.8 },
  sectionCopy: { flex: 1, minWidth: 0, gap: 4 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: UIColors.foreground },
  focusBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 0 },
  focusBadgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", color: UIColors.secondaryForeground },
  passMeta: { fontSize: 11, fontWeight: "700", color: UIColors.mutedForeground },
  sectionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionPtsMeta: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"], color: UIColors.mutedForeground },
  scoreBadge: { borderRadius: 8, borderColor: "transparent", paddingHorizontal: 8, paddingVertical: 2 },
  scoreBadgeText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  questionRow: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: UIColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questionMain: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  questionIcon: {
    marginTop: 2,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  questionBody: { flex: 1, minWidth: 0, gap: 4 },
  questionTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  questionText: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18, color: UIColors.foreground },
  questionId: { fontSize: 11, fontWeight: "800", color: UIColors.mutedForeground },
  questionPtsBadge: { borderRadius: 8, borderColor: "transparent", paddingHorizontal: 6, paddingVertical: 2 },
  questionPtsText: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  evidenceBox: { borderRadius: 8, backgroundColor: "rgba(241,245,249,0.9)", paddingHorizontal: 10, paddingVertical: 8 },
  evidenceText: { fontSize: 12, fontWeight: "600", fontStyle: "italic", lineHeight: 17, color: UIColors.mutedForeground },
  emptySection: { borderTopWidth: 1, borderTopColor: UIColors.border, paddingHorizontal: 14, paddingVertical: 12 },
  emptySectionText: { fontSize: 13, fontWeight: "600", color: UIColors.mutedForeground },
});
