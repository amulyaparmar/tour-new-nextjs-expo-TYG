import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import {
  listCommunityEnrichment,
  type CommunityEnrichment,
  type MobileAuthSession,
} from "../auth";
import { tourColors } from "@/theme/tour-brand";

const SHEET_HEIGHT_RATIO = 0.72;
const SHEET_MAX_HEIGHT = 650;
const ROW_HEIGHT = 59;
const SKELETON_ROWS = 9;

type Community = MobileAuthSession["workspace"]["communities"][number];

type CommunityPickerModalProps = {
  visible: boolean;
  session: MobileAuthSession;
  query: string;
  switchingId: string | null;
  title?: string;
  subtitle?: string;
  closeButtonVisible?: boolean;
  dismissDisabled?: boolean;
  onAddProperty?: (query: string) => void;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelect: (communityId: string) => void;
};

export function CommunityPickerModal({
  visible,
  session,
  query,
  switchingId,
  title = "Choose a property",
  subtitle = "Your dashboard, sessions, assets, and integrations will update.",
  closeButtonVisible = true,
  dismissDisabled = false,
  onAddProperty,
  onQueryChange,
  onClose,
  onSelect,
}: CommunityPickerModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [listReady, setListReady] = useState(false);
  const enrichmentQuery = useQuery({
    queryKey: ["community-enrichment", session.workspace.user.email],
    queryFn: listCommunityEnrichment,
    enabled: visible,
    staleTime: 60_000,
    retry: 1,
  });
  const enrichmentByCommunity = useMemo(
    () => new Map(
      (enrichmentQuery.data ?? []).map((item) => [item.communityId, item] as const)
    ),
    [enrichmentQuery.data]
  );
  const sheetHeight = Math.round(Math.min(windowHeight * SHEET_HEIGHT_RATIO, SHEET_MAX_HEIGHT));
  const filteredCommunities = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? session.workspace.communities.filter((community) =>
          `${community.name} ${community.alias ?? ""}`.toLowerCase().includes(value)
        )
      : session.workspace.communities;
  }, [query, session.workspace.communities]);
  const activeCommunityId = session.workspace.community.id;
  const switchLocked = Boolean(switchingId);
  const interactionLocked = switchLocked || dismissDisabled;

  useEffect(() => {
    if (!visible) {
      setListReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setListReady(true));
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const renderCommunity = useCallback(
    ({ item }: { item: Community }) => {
      const active = item.id === activeCommunityId;
      const loading = switchingId === item.id;
      const enrichment = enrichmentByCommunity.get(item.id);
      return (
        <TouchableOpacity
          activeOpacity={0.72}
          disabled={switchLocked}
          onPress={() => onSelect(item.id)}
        >
          <View style={styles.row}>
            <View style={[styles.rowIcon, active && styles.rowIconActive]}>
              <Ionicons
                name="business-outline"
                size={18}
                color={active ? tourColors.green : tourColors.brand}
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.rowMetadata}>
                {item.alias ? (
                  <Text style={styles.rowAlias} numberOfLines={1}>
                    {item.alias}
                  </Text>
                ) : null}
                {enrichment ? <EnrichmentBadge enrichment={enrichment} /> : null}
              </View>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={tourColors.brand} />
            ) : active ? (
              <Ionicons name="checkmark-circle" size={20} color={tourColors.green} />
            ) : (
              <Ionicons name="chevron-forward" size={17} color={tourColors.textMuted} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [activeCommunityId, enrichmentByCommunity, onSelect, switchLocked, switchingId]
  );

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      sheetHeight={sheetHeight}
      dismissDisabled={interactionLocked}
      keyboardAvoiding
      dragHeader={
        <View style={styles.titleRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {closeButtonVisible ? (
            <Pressable
              accessibilityLabel="Close properties"
              disabled={switchLocked}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={tourColors.text} />
            </Pressable>
          ) : null}
        </View>
      }
      header={
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={tourColors.textMuted} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search properties"
            placeholderTextColor={tourColors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      }
      contentStyle={styles.listContent}
    >
      <>
        {!listReady ? (
          <View style={styles.list}>
            {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <View key={index} style={styles.skeletonRow}>
                <View style={styles.skeletonIcon} />
                <View style={styles.skeletonBody}>
                  <View style={styles.skeletonLine} />
                  <View style={styles.skeletonLineShort} />
                </View>
              </View>
            ))}
          </View>
        ) : filteredCommunities.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="business-outline" size={28} color={tourColors.textMuted} />
            <Text style={styles.emptyTitle}>No assigned properties found</Text>
            <Text style={styles.emptySub}>Try another search or add a property below.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredCommunities}
            renderItem={renderCommunity}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            initialNumToRender={16}
            maxToRenderPerBatch={14}
            updateCellsBatchingPeriod={30}
            windowSize={7}
            removeClippedSubviews
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          />
        )}
        {onAddProperty ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onAddProperty(query.trim())}
            style={({ pressed }) => [styles.addPropertyButton, pressed && styles.addPropertyPressed]}
          >
            <View style={styles.addPropertyIcon}>
              <Ionicons name="add" size={18} color={tourColors.brand} />
            </View>
            <View style={styles.addPropertyCopy}>
              <Text style={styles.addPropertyTitle}>Find or add a property</Text>
              <Text style={styles.addPropertySubtitle}>Search Tour property intelligence</Text>
            </View>
            <Ionicons name="open-outline" size={17} color={tourColors.textMuted} />
          </Pressable>
        ) : null}
      </>
    </BottomSheetModal>
  );
}

function EnrichmentBadge({ enrichment }: { enrichment: CommunityEnrichment }) {
  const enriched = enrichment.state === "enriched";
  const indexed = enrichment.state === "indexed";
  return (
    <View
      style={[
        styles.enrichmentBadge,
        enriched ? styles.enrichmentBadgeReady : indexed ? styles.enrichmentBadgeIndexed : null,
      ]}
    >
      <View
        style={[
          styles.enrichmentDot,
          enriched ? styles.enrichmentDotReady : indexed ? styles.enrichmentDotIndexed : null,
        ]}
      />
      <Text
        style={[
          styles.enrichmentText,
          enriched ? styles.enrichmentTextReady : indexed ? styles.enrichmentTextIndexed : null,
        ]}
      >
        {enriched ? "Enriched" : indexed ? "Indexed" : "Not linked"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: tourColors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: tourColors.textSec,
    fontSize: 12,
    lineHeight: 17,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: tourColors.border,
    backgroundColor: tourColors.card,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: tourColors.card,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: tourColors.text,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: ROW_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowIcon: {
    width: 34,
    height: 34,
    marginRight: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
  },
  rowIconActive: {
    backgroundColor: tourColors.greenBg,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowName: {
    color: tourColors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  rowAlias: {
    color: tourColors.textSec,
    fontSize: 12,
    fontWeight: "600",
  },
  rowMetadata: {
    minHeight: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 2,
  },
  enrichmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#f2f4f7",
  },
  enrichmentBadgeReady: { backgroundColor: "#ecfdf3" },
  enrichmentBadgeIndexed: { backgroundColor: "#eff8ff" },
  enrichmentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#98a2b3" },
  enrichmentDotReady: { backgroundColor: "#17b26a" },
  enrichmentDotIndexed: { backgroundColor: tourColors.brand },
  enrichmentText: { color: "#667085", fontSize: 9, lineHeight: 12, fontWeight: "800" },
  enrichmentTextReady: { color: "#067647" },
  enrichmentTextIndexed: { color: "#175cd3" },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  emptyTitle: {
    color: tourColors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  emptySub: {
    color: tourColors.textSec,
    fontSize: 12,
  },
  addPropertyButton: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#cfe0ff",
    borderRadius: 12,
    backgroundColor: "#f5f8ff",
  },
  addPropertyPressed: { opacity: 0.72 },
  addPropertyIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#e6efff",
  },
  addPropertyCopy: { flex: 1, gap: 2 },
  addPropertyTitle: { color: tourColors.text, fontSize: 13, fontWeight: "800" },
  addPropertySubtitle: { color: tourColors.textSec, fontSize: 11, fontWeight: "600" },
  skeletonRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  skeletonIcon: {
    width: 34,
    height: 34,
    marginRight: 11,
    borderRadius: 8,
    backgroundColor: "#eef2f7",
  },
  skeletonBody: {
    flex: 1,
    gap: 7,
  },
  skeletonLine: {
    width: "58%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#eef2f7",
  },
  skeletonLineShort: {
    width: "34%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#f3f5f8",
  },
});
