import type { AnalysisResult } from "@tour/shared";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { fetchAnalysis } from "@/api";
import { SessionAiChat } from "@/components/SessionAiChat";

import { TourScreenHeader } from "./tour-screen-header";

export function SessionAiChatScreen({
  sessionId,
  sessionTitle,
  prospectName,
  onBack,
}: {
  sessionId: string;
  sessionTitle?: string;
  prospectName?: string;
  onBack: () => void;
}) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await fetchAnalysis(sessionId);
        if (mounted) setAnalysis(res.analysis);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  return (
    <View style={{ flex: 1, backgroundColor: "#f4f7fb", paddingTop: 50 }}>
      <TourScreenHeader onBack={onBack} title={sessionTitle ?? "Tour AI"} subtitle={prospectName ?? "Coaching assistant"} />
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#006ce5" />
        </View>
      ) : analysis ? (
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <SessionAiChat sessionId={sessionId} analysis={analysis} showHeader={false} />
        </View>
      ) : null}
    </View>
  );
}
