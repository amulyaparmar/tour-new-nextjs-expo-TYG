import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MobileAuthSession } from "../auth";
import { tourColors } from "@/theme/tour-brand";

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.72);

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
  const filteredCommunities = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? session.workspace.communities.filter((community) =>
          `${community.name} ${community.alias ?? ""}`.toLowerCase().includes(value)
        )
      : session.workspace.communities;
  }, [query, session.workspace.communities]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={Boolean(switchingId)} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
              disabled={Boolean(switchingId)}
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

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {filteredCommunities.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="business-outline" size={28} color={tourColors.textMuted} />
                <Text style={styles.emptyTitle}>No communities found</Text>
                <Text style={styles.emptySub}>Try a different search.</Text>
              </View>
            ) : (
              filteredCommunities.map((item) => {
                const active = item.id === session.workspace.community.id;
                const loading = switchingId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.72}
                    disabled={Boolean(switchingId)}
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
              })
            )}
          </ScrollView>
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
    height: SHEET_HEIGHT,
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
    minHeight: 58,
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
});
