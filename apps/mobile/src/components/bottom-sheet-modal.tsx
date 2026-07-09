import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DEFAULT_SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.72);
const DISMISS_DISTANCE = 88;
const DISMISS_VELOCITY = 0.85;
const UPWARD_RESISTANCE = 0.18;
const MAX_UPWARD_OVERDRAG = 34;
const SHEET_EASING = Easing.out(Easing.cubic);
const SHEET_SPRING = { damping: 22, stiffness: 260, mass: 0.8 };
const AnimatedView = Reanimated.View;

type BottomSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  sheetHeight?: number;
  dismissDisabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
};

export function BottomSheetModal({
  visible,
  onClose,
  children,
  header,
  sheetHeight = DEFAULT_SHEET_HEIGHT,
  dismissDisabled = false,
  contentStyle,
  keyboardAvoiding = false,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const isClosing = useRef(false);
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);

  const finishDismiss = useCallback(
    (notifyParent: boolean) => {
      isClosing.current = false;
      setRendered(false);
      if (notifyParent) onClose();
    },
    [onClose]
  );

  const animateDismiss = useCallback(
    (notifyParent: boolean) => {
      if (dismissDisabled || isClosing.current) return;
      isClosing.current = true;
      translateY.value = withTiming(sheetHeight, { duration: 220, easing: SHEET_EASING }, (finished) => {
        if (finished) runOnJS(finishDismiss)(notifyParent);
      });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    },
    [backdropOpacity, dismissDisabled, finishDismiss, sheetHeight, translateY]
  );

  const animatePresent = useCallback(() => {
    isClosing.current = false;
    translateY.value = sheetHeight;
    translateY.value = withTiming(0, { duration: 260, easing: SHEET_EASING });
    backdropOpacity.value = withTiming(1, { duration: 220, easing: SHEET_EASING });
  }, [backdropOpacity, sheetHeight, translateY]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    if (!rendered || isClosing.current) return;
    animateDismiss(false);
  }, [animateDismiss, rendered, visible]);

  useEffect(() => {
    if (!visible || !rendered) return;
    animatePresent();
  }, [animatePresent, rendered, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !dismissDisabled && Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          if (dismissDisabled) return;
          if (gesture.dy < 0) {
            translateY.value = Math.max(-MAX_UPWARD_OVERDRAG, gesture.dy * UPWARD_RESISTANCE);
            backdropOpacity.value = 1;
            return;
          }
          translateY.value = gesture.dy;
          backdropOpacity.value = Math.max(0, 1 - gesture.dy / sheetHeight);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (dismissDisabled) return;
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            animateDismiss(true);
            return;
          }
          translateY.value = withSpring(0, SHEET_SPRING);
          backdropOpacity.value = withTiming(1, { duration: 160, easing: SHEET_EASING });
        },
        onPanResponderTerminate: () => {
          translateY.value = withSpring(0, SHEET_SPRING);
          backdropOpacity.value = withTiming(1, { duration: 160, easing: SHEET_EASING });
        },
      }),
    [animateDismiss, backdropOpacity, dismissDisabled, sheetHeight, translateY]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={() => animateDismiss(true)}>
      <View style={styles.root}>
        <AnimatedView style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel="Close sheet"
            disabled={dismissDisabled}
            onPress={() => animateDismiss(true)}
            style={StyleSheet.absoluteFill}
          />
        </AnimatedView>

        <KeyboardAvoidingView
          behavior={keyboardAvoiding && Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={styles.keyboardAvoiding}
        >
          <AnimatedView
            style={[
              styles.sheet,
              sheetStyle,
              {
                height: sheetHeight,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.dragRegion} {...panResponder.panHandlers}>
              <View style={styles.handle} />
              {header}
            </View>
            <View style={[styles.body, contentStyle]}>{children}</View>
          </AnimatedView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,24,40,0.52)",
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
  },
  dragRegion: {
    alignSelf: "stretch",
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
  body: {
    flex: 1,
    minHeight: 0,
  },
});
