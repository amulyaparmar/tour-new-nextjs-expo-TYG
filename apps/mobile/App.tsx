import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect } from "react";
import { AppState, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const loginBackground = require("./assets/videos/login-bg.mp4");
const tourLogo = require("./assets/images/tour-logo.png");

export default function App() {
  const player = useVideoPlayer(loginBackground, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useEffect(() => {
    player.play();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        player.play();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={styles.backgroundVideo}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        playsInline
      />
      <View style={styles.scrim} />

      <KeyboardAvoidingView behavior="padding" style={styles.content}>
        <View style={styles.brandLockup}>
          <Image source={tourLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.subtitle}>
            Every great business deserves a great tour. Build yours today.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.78)"
            style={styles.input}
          />
          <TextInput
            autoCapitalize="none"
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.78)"
            secureTextEntry
            style={styles.input}
          />

          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Sign in with Google</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2024</Text>
          <Text style={styles.footerText}>About Us</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#000000",
    flex: 1,
    height: "100%",
    overflow: "hidden",
    width: "100%"
  },
  backgroundVideo: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    width: "100%"
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 28
  },
  brandLockup: {
    gap: 14,
    marginBottom: 28
  },
  logo: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 8,
    height: 74,
    width: 184
  },
  subtitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 25,
    maxWidth: 340
  },
  form: {
    gap: 12
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#4d8ae5",
    borderRadius: 8,
    minHeight: 52,
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.82
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 2
  },
  divider: {
    backgroundColor: "rgba(255,255,255,0.55)",
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  dividerText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    minHeight: 52,
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "800"
  },
  footer: {
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 22,
    position: "absolute",
    right: 22
  },
  footerText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "600"
  }
});
