import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Material } from "../api";
import { supportsBackgroundRecording } from "../runtime";
import { formatElapsed } from "./formatElapsed";
import { useRecording } from "./RecordingProvider";

const C = {
  brand: "#006ce5",
  text: "#101828",
  textSec: "#667085",
  textMuted: "#8a94a6",
  green: "#16a34a",
  greenBg: "#eefaf3",
  purple: "#7c3aed",
  purpleBg: "#f3e8ff",
} as const;

type RecordingExperienceProps = {
  title?: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  assets: Material[];
  selectedAssetIds: string[];
  onAddAsset: (asset: Material) => void;
  onCancel: () => void | Promise<void>;
  onFinish: () => void | Promise<void>;
  cancelIcon?: "chevron-down" | "close";
  cancelDisabled?: boolean;
  caption?: string;
};

function AssetsEmptyState() {
  return (
    <View style={s.emptyState}>
      <Ionicons name="folder-open-outline" size={28} color={C.textMuted} />
      <Text style={s.emptyTitle}>No assets yet</Text>
      <Text style={s.emptySubtitle}>Add files from the Assets tab.</Text>
    </View>
  );
}

export function RecordingExperience({
  title,
  notes,
  onNotesChange,
  assets,
  selectedAssetIds,
  onAddAsset,
  onCancel,
  onFinish,
  cancelIcon = "chevron-down",
  cancelDisabled = false,
  caption,
}: RecordingExperienceProps) {
  const rec = useRecording();
  const [assetSheetOpen, setAssetSheetOpen] = useState(false);

  const statusCaption =
    caption ??
    (rec.isPaused
      ? "Recording paused"
      : supportsBackgroundRecording()
        ? "Recording securely in the background"
        : "Recording — Expo Go preview");

  return (
    <View style={s.root}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel="Cancel recording"
          disabled={cancelDisabled}
          onPress={() => void onCancel()}
          style={[s.topButton, cancelDisabled && s.disabled]}
        >
          <Ionicons name={cancelIcon} size={22} color={C.text} />
        </Pressable>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>{rec.isPaused ? "PAUSED" : "RECORDING"}</Text>
        </View>
        <View style={s.topSpacer} />
      </View>

      <View style={s.assetGrid}>
        {assets.slice(0, 2).map((asset) => (
          <Pressable
            key={asset.id}
            onPress={() => onAddAsset(asset)}
            style={({ pressed }) => [s.assetCard, pressed && s.pressed]}
          >
            <Ionicons
              name={asset.type === "training" ? "play-circle-outline" : "image-outline"}
              size={28}
              color={C.brand}
            />
            <Text style={s.assetTitle} numberOfLines={2}>
              {asset.name}
            </Text>
            {selectedAssetIds.includes(asset.id) && (
              <Ionicons name="checkmark-circle" size={18} color={C.green} style={s.assetCheck} />
            )}
          </Pressable>
        ))}
        <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [s.assetCard, pressed && s.pressed]}>
          <Ionicons name="document-text-outline" size={24} color={C.brand} />
          <Text style={s.assetTitle}>Notes</Text>
          <Text style={s.assetSub} numberOfLines={2}>
            Add room details and follow-ups.
          </Text>
        </Pressable>
        <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [s.assetCard, pressed && s.pressed]}>
          <Ionicons name="attach-outline" size={24} color={C.brand} />
          <Text style={s.assetTitle}>Assets</Text>
          <Text style={s.assetSub} numberOfLines={2}>
            Add media from your library.
          </Text>
        </Pressable>
      </View>

      <View style={s.center}>
        <Text style={s.sessionTitle} numberOfLines={1}>
          {title || "Tour conversation"}
        </Text>
        <Text style={s.caption}>{statusCaption}</Text>
      </View>

      <View style={s.controls}>
        <View style={s.action}>
          <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [s.actionButton, pressed && s.pressed]}>
            <Ionicons name="attach" size={25} color={C.text} />
            {selectedAssetIds.length > 0 && (
              <View style={s.actionCount}>
                <Text style={s.actionCountText}>{selectedAssetIds.length}</Text>
              </View>
            )}
          </Pressable>
          <Text style={s.actionLabel}>Assets</Text>
        </View>
        <View style={[s.action, s.actionCenter]}>
          <View style={s.waveRow} accessibilityElementsHidden>
            {[18, 30, 42, 24, 38, 28].map((height, index) => (
              <View key={`left-${index}`} style={[s.waveBar, { height }]} />
            ))}
          </View>
          <Pressable
            accessibilityLabel={rec.isPaused ? "Resume recording" : "Pause recording"}
            onPress={() => void rec.togglePause()}
            style={({ pressed }) => [s.pauseButton, pressed && s.pressed]}
          >
            <Ionicons name={rec.isPaused ? "play" : "pause"} size={24} color="#fff" />
          </Pressable>
          <View style={s.waveRow} accessibilityElementsHidden>
            {[34, 20, 44, 24, 32, 16].map((height, index) => (
              <View key={`right-${index}`} style={[s.waveBar, { height }]} />
            ))}
          </View>
        </View>
        <View style={s.action}>
          <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [s.actionButton, pressed && s.pressed]}>
            <Ionicons name="create-outline" size={24} color={C.text} />
          </Pressable>
          <Text style={s.actionLabel}>Notes</Text>
        </View>
      </View>

      <Text style={s.timer}>{formatElapsed(rec.elapsed)}</Text>
      <Pressable onPress={() => void onFinish()} style={({ pressed }) => [s.finishButton, pressed && s.pressed]}>
        <Text style={s.finishButtonText}>Finish recording</Text>
      </Pressable>

      <Modal visible={assetSheetOpen} transparent animationType="slide" onRequestClose={() => setAssetSheetOpen(false)}>
        <View style={s.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssetSheetOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.assetSheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={s.flex1}>
                <Text style={s.sheetTitle}>Follow-up assets</Text>
                <Text style={s.sheetSubtitle}>Add links while they are top of mind.</Text>
              </View>
              <Pressable
                accessibilityLabel="Close assets"
                onPress={() => setAssetSheetOpen(false)}
                style={s.iconButton}
              >
                <Ionicons name="close" size={20} color={C.text} />
              </Pressable>
            </View>
            <ScrollView style={s.assetSheetList} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {assets.length ? (
                assets.map((asset) => {
                  const selected = selectedAssetIds.includes(asset.id);
                  return (
                    <Pressable
                      key={asset.id}
                      onPress={() => onAddAsset(asset)}
                      style={[s.assetPickRow, selected && s.assetPickRowSelected]}
                    >
                      <View style={[s.materialIcon, { backgroundColor: selected ? C.greenBg : C.purpleBg }]}>
                        <Ionicons
                          name={selected ? "checkmark" : "document-attach-outline"}
                          size={18}
                          color={selected ? C.green : C.purple}
                        />
                      </View>
                      <View style={s.flex1}>
                        <Text style={s.assetPickTitle} numberOfLines={1}>
                          {asset.name}
                        </Text>
                        <Text style={s.assetPickMeta} numberOfLines={1}>
                          {asset.description || asset.type}
                        </Text>
                      </View>
                      <Text style={[s.assetPickAction, selected && { color: C.green }]}>
                        {selected ? "Added" : "Add"}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <AssetsEmptyState />
              )}
            </ScrollView>
            <TextInput
              value={notes}
              onChangeText={onNotesChange}
              placeholder="Add a quick follow-up note"
              placeholderTextColor={C.textMuted}
              multiline
              style={s.assetNotesInput}
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f7",
  },
  topSpacer: { width: 42 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.brand + "12",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.brand },
  liveText: { color: C.brand, fontSize: 10, fontWeight: "900" },
  assetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 46 },
  assetCard: {
    width: "48.5%",
    minHeight: 112,
    justifyContent: "flex-end",
    gap: 5,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#f2f2f7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  assetTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  assetSub: { color: "#636366", fontSize: 11, lineHeight: 15 },
  assetCheck: { position: "absolute", right: 9, top: 9 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 12 },
  sessionTitle: { color: "#636366", fontSize: 20, fontWeight: "800", textTransform: "uppercase" },
  caption: { color: "#98a2b3", fontSize: 12, fontWeight: "600", marginTop: 7 },
  controls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around" },
  action: { width: 82, alignItems: "center", gap: 8 },
  actionCenter: { flex: 1, width: undefined, flexDirection: "row", justifyContent: "center" },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(25,23,23,0.06)",
  },
  actionCount: {
    position: "absolute",
    top: -3,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand,
    borderWidth: 2,
    borderColor: "#fff",
  },
  actionCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  actionLabel: { color: C.text, fontSize: 10, fontWeight: "700" },
  waveRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: C.brand },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand,
    shadowColor: C.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 9,
  },
  timer: {
    color: "#111",
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    marginTop: 18,
    textAlign: "center",
  },
  finishButton: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
  },
  finishButtonText: { color: C.brand, fontSize: 12, fontWeight: "900" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,24,40,0.52)" },
  assetSheet: {
    maxHeight: "78%",
    minHeight: "52%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "ios" ? 32 : 18,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    backgroundColor: "#d0d5dd",
    marginTop: 9,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "900" },
  sheetSubtitle: { color: C.textSec, fontSize: 12, marginTop: 2 },
  assetSheetList: { flexGrow: 0, marginBottom: 12 },
  assetPickRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  assetPickRowSelected: { borderColor: "#abefc6", backgroundColor: "#ecfdf3" },
  materialIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  assetPickTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  assetPickMeta: { color: C.textSec, fontSize: 11, marginTop: 2 },
  assetPickAction: { color: C.brand, fontSize: 11, fontWeight: "900" },
  assetNotesInput: {
    minHeight: 74,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    padding: 11,
    color: C.text,
    fontSize: 13,
    textAlignVertical: "top",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.08)",
    backgroundColor: "#fff",
  },
  emptyState: { padding: 24, alignItems: "center", gap: 6 },
  emptyTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  emptySubtitle: { color: C.textSec, fontSize: 12, textAlign: "center" },
  flex1: { flex: 1 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
