import { Ionicons } from "@expo/vector-icons";
import type { AnalysisResult } from "@tour/shared";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Reanimated, { FadeInDown, LinearTransition } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
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
    <View className="gap-3">
      <Reanimated.View entering={tourEnter.fadeDown} className="flex-row items-center gap-2">
        <Ionicons name="clipboard-outline" size={18} color={tourColors.brand} />
        <Text className="flex-1 text-[15px] font-black text-foreground">Question breakdown</Text>
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
          className="h-8 px-2"
        >
          <Text className="text-[11px] font-extrabold text-primary">
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
          <Reanimated.View
            key={sec.section}
            entering={tourEnter.stagger(sectionIndex, 60)}
            layout={tourEnter.layout}
          >
            <Card
              className="overflow-hidden border-border py-0"
              style={{ borderLeftWidth: 4, borderLeftColor: c }}
            >
              <Pressable
                onPress={() => {
                  selectionHaptic();
                  setExpanded((p) => ({ ...p, [sec.section]: !p[sec.section] }));
                }}
                className="flex-row items-center gap-2.5 p-3.5 active:opacity-80"
              >
                <View className="min-w-0 flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    <Text selectable className="flex-1 text-sm font-extrabold text-foreground">
                      {sec.section}
                    </Text>
                    {isFocus ? (
                      <Badge variant="secondary" className="rounded-md px-1.5 py-0">
                        <Text className="text-[9px] font-black uppercase text-secondary-foreground">Focus</Text>
                      </Badge>
                    ) : null}
                  </View>
                  {hasQ ? (
                    <Text className="text-[11px] font-bold text-muted-foreground">
                      {passCount}/{sec.questions.length} passed
                    </Text>
                  ) : null}
                </View>
                <View className="shrink-0 flex-row items-center gap-2">
                  {sec.pointsPossible > 0 ? (
                    <Text selectable className="text-xs font-bold tabular-nums text-muted-foreground">
                      {sec.pointsEarned}/{sec.pointsPossible}
                    </Text>
                  ) : null}
                  <Badge
                    variant="outline"
                    className="rounded-md border-transparent px-2 py-0.5"
                    style={{ backgroundColor: `${c}18` }}
                  >
                    <Text selectable className="text-xs font-extrabold tabular-nums" style={{ color: c }}>
                      {sec.score}%
                    </Text>
                  </Badge>
                  <Ionicons
                    name={exp ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={tourColors.textMuted}
                  />
                </View>
              </Pressable>

              {exp && hasQ ? (
                <Reanimated.View entering={FadeInDown.duration(220)} layout={LinearTransition.springify()}>
                  {sec.questions.map((q, qi) => (
                    <Reanimated.View
                      key={q.id}
                      entering={tourEnter.stagger(qi, 35)}
                      className="gap-2 border-t border-border px-3.5 py-3"
                    >
                      <View className="flex-row items-start gap-2.5">
                        <View
                          className="mt-0.5 h-7 w-7 items-center justify-center rounded-full"
                          style={{ backgroundColor: q.passed ? tourColors.greenBg : tourColors.redBg }}
                        >
                          <Ionicons
                            name={q.passed ? "checkmark" : "close"}
                            size={14}
                            color={q.passed ? tourColors.green : tourColors.red}
                          />
                        </View>
                        <View className="min-w-0 flex-1 gap-1">
                          <View className="flex-row items-start justify-between gap-2">
                            <Text selectable className="flex-1 text-[13px] font-bold leading-[18px] text-foreground">
                              <Text className="text-[11px] font-extrabold text-muted-foreground">{q.id} </Text>
                              {q.question}
                            </Text>
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-md border-transparent px-1.5 py-0.5"
                              style={{ backgroundColor: q.passed ? tourColors.greenBg : tourColors.redBg }}
                            >
                              <Text
                                selectable
                                className="text-[11px] font-extrabold tabular-nums"
                                style={{ color: q.passed ? tourColors.green : tourColors.red }}
                              >
                                {q.earnedPoints}/{q.maxPoints}
                              </Text>
                            </Badge>
                          </View>
                          {q.evidence ? (
                            <View className="rounded-lg bg-muted/60 px-2.5 py-2">
                              <Text selectable className="text-xs font-semibold italic leading-[17px] text-muted-foreground">
                                "{q.evidence}"
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Reanimated.View>
                  ))}
                </Reanimated.View>
              ) : null}

              {exp && !hasQ ? (
                <CardContent className="border-t border-border px-3.5 py-3">
                  <Text className="text-[13px] font-semibold text-muted-foreground">
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
