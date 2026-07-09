import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MobileAuthSession } from "../auth";
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
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelect: (communityId: string) => void;
};

export function CommunityPickerModal({
  visible,
  session,
  query,
  switchingId,
  onQueryChange,
  onClose,
  onSelect,
}: CommunityPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [listReady, setListReady] = useState(false);
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
              {item.alias ? (
                <Text style={styles.rowAlias} numberOfLines={1}>
                  {item.alias}
                </Text>
              ) : null}
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
    [activeCommunityId, onSelect, switchLocked, switchingId]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={switchLocked} onPress={onClose} />
        <View style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Switch community</Text>
              <Text style={styles.subtitle}>
                Your dashboard, sessions, assets, and integrations will update.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close communities"
              disabled={switchLocked}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={tourColors.text} />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={tourColors.textMuted} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              placeholder="Search communities"
              placeholderTextColor={tourColors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

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
              <Text style={styles.emptyTitle}>No communities found</Text>
              <Text style={styles.emptySub}>Try a different search.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredCommunities}
              renderItem={renderCommunity}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16,24,40,0.52)",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
  },
  handle: {
    width: 40,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    backgroundColor: "#d0d5dd",
    marginTop: 9,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
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
    marginTop: 2,
    color: tourColors.textSec,
    fontSize: 12,
    fontWeight: "600",
  },
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
