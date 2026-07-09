import type { AnalysisResult } from "@tour/shared";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Reanimated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { tourEnter } from "@/theme/animations";
import { scoreColor } from "@/theme/tour-brand";

function AnimatedBar({ percent, color }: { percent: number; color: string }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const width = useSharedValue(0);

  useEffect(() => {
    if (trackWidth <= 0) return;
    width.value = withTiming((Math.max(0, Math.min(100, percent)) / 100) * trackWidth, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent, trackWidth, width]);

  const style = useAnimatedStyle(() => ({
    width: width.value,
  }));

  return (
    <View
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Reanimated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: color }, style]} />
    </View>
  );
}

export function ScoreHero({ analysis }: { analysis: AnalysisResult }) {
  const color = scoreColor(analysis.overallScore);
  const pts =
    analysis.totalPointsEarned ??
    Math.round((analysis.overallScore / 100) * (analysis.totalPointsPossible ?? 200));
  const max = analysis.totalPointsPossible ?? 200;

  return (
    <Reanimated.View entering={tourEnter.fadeDown} layout={tourEnter.layout}>
      <Card className="gap-0 border-border py-0">
        <CardContent className="gap-4 px-4 py-4">
          <Reanimated.View entering={FadeInDown.delay(40).duration(360).springify()} className="items-center gap-1.5">
            <View
              className="h-[120px] w-[120px] items-center justify-center rounded-full border-[8px]"
              style={{ borderColor: `${color}22` }}
            >
              <Text selectable className="text-4xl font-black tabular-nums" style={{ color }}>
                {analysis.overallScore}
                <Text className="text-lg font-bold">%</Text>
              </Text>
            </View>
            <Text selectable className="text-[13px] font-extrabold text-muted-foreground">
              {pts}/{max} pts
            </Text>
          </Reanimated.View>

          <View className="gap-2.5">
            {analysis.sectionScores.map((sec, index) => {
              const c = scoreColor(sec.score);
              return (
                <Reanimated.View
                  key={sec.section}
                  entering={tourEnter.stagger(index, 55)}
                  layout={tourEnter.layout}
                  className="gap-1"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text selectable className="flex-1 text-[13px] font-bold text-foreground" numberOfLines={1}>
                      {sec.section}
                    </Text>
                    <Text selectable className="text-[13px] font-extrabold tabular-nums" style={{ color: c }}>
                      {sec.pointsPossible > 0
                        ? `${sec.pointsEarned}/${sec.pointsPossible}`
                        : `${sec.score}%`}
                    </Text>
                  </View>
                  <AnimatedBar percent={sec.score} color={c} />
                </Reanimated.View>
              );
            })}
          </View>
        </CardContent>
      </Card>
    </Reanimated.View>
  );
}

export function ScoreCompact({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <Reanimated.View
      entering={FadeInDown.duration(300).springify()}
      layout={tourEnter.layout}
      className="w-[108px] self-stretch justify-center rounded-2xl border px-3.5 py-3"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}10` }}
    >
      <Text selectable className="text-[26px] font-black leading-8 tabular-nums" style={{ color }}>
        {score}%
      </Text>
      <Text className="mt-0.5 text-[10px] font-black uppercase text-muted-foreground">Tour score</Text>
    </Reanimated.View>
  );
}
