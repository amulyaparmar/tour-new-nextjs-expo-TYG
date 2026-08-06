import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { selectionHaptic } from "@/lib/haptics";
import { MrTourStateImage } from "@/components/MrTourStateImage";

const FAB_WIDTH = 64;
const FAB_HEIGHT = 64;
const EDGE_PAD = 18;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export function SessionAiFab({
  onPress,
  bottomOffset,
}: {
  onPress: () => void;
  bottomOffset: number;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const bounds = useMemo(() => {
    // Default anchor: bottom-right with `bottomOffset` / `right: EDGE_PAD`.
    const minX = -(windowWidth - FAB_WIDTH - EDGE_PAD * 2);
    const maxX = 0;
    const minY = -(windowHeight - FAB_HEIGHT - bottomOffset - insets.top - EDGE_PAD);
    const maxY = 0;
    return { minX, maxX, minY, maxY };
  }, [bottomOffset, insets.top, windowHeight, windowWidth]);

  const handlePress = () => {
    selectionHaptic();
    onPress();
  };

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      dragStartX.value = translateX.value;
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = clamp(
        dragStartX.value + event.translationX,
        bounds.minX,
        bounds.maxX,
      );
      translateY.value = clamp(
        dragStartY.value + event.translationY,
        bounds.minY,
        bounds.maxY,
      );
    })
    .onEnd(() => {
      // Snap to the closer horizontal screen edge; keep vertical where released.
      const midX = (bounds.minX + bounds.maxX) / 2;
      const snapX = translateX.value < midX ? bounds.minX : bounds.maxX;
      const snapY = clamp(translateY.value, bounds.minY, bounds.maxY);
      translateX.value = withSpring(snapX, { damping: 28, stiffness: 320, mass: 0.8, overshootClamping: true });
      translateY.value = withSpring(snapY, { damping: 28, stiffness: 320, mass: 0.8, overshootClamping: true });
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(handlePress)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel="Open Tour AI chat"
          style={[styles.button, animatedStyle]}
        >
          <MrTourStateImage state="assistant" size={58} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: EDGE_PAD,
    zIndex: 20,
  },
  button: {
    width: FAB_WIDTH,
    height: FAB_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#b2ddff",
    backgroundColor: "#fff",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
});
