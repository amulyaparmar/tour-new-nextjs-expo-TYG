import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { tourColors as C } from "../theme/tour-brand";

type RecordedVideoAsset = {
  uri: string;
  fileName: string;
  mimeType: "video/mp4";
  name: string;
  description: string;
  durationSec: number;
};

type VideoAssetRecorderProps = {
  visible: boolean;
  onClose: () => void;
  onUpload: (asset: RecordedVideoAsset) => Promise<void>;
};

export function VideoAssetRecorder({ visible, onClose }: VideoAssetRecorderProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="videocam" size={30} color={C.brand} />
          </View>
          <Text style={styles.title}>Record a video in the mobile app</Text>
          <Text style={styles.body}>
            Camera recording is available in the iOS and Android app. In this
            browser preview, use the plus button on Assets to upload an existing
            video.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    padding: 28,
    borderRadius: 24,
    backgroundColor: "#fff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
  },
  icon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderRadius: 20,
    backgroundColor: "#eef4ff",
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    color: C.textSec,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    textAlign: "center",
  },
  button: {
    minWidth: 132,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: C.brand,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});

export type { RecordedVideoAsset };
