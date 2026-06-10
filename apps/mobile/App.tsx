import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const onboardingBackground = require("./assets/videos/login-bg.mp4");

type Screen = "onboarding" | "home" | "profile" | "tour";
type OnboardingStep = "rep" | "property" | "security";
type TourStep = "contact" | "preferences" | "ready";

const leasingAgent = {
  name: "Alex Johnson",
  title: "Leasing Consultant",
  property: "Downtown Lofts",
  email: "alex@downtownlofts.com",
  phone: "(512) 555-0189",
  profileUrl: "tour.video/alex-downtown"
};

const qrRows = [
  "111111001011111",
  "100001010110001",
  "101101111010101",
  "101101000010101",
  "100001011110001",
  "111111101011111",
  "000000010000000",
  "110101111001011",
  "001110010111100",
  "101001101000101",
  "011111001111010",
  "100010110010111",
  "101110001011001",
  "100000111101101",
  "111111010011111"
];

const tourSteps: Array<{ id: TourStep; label: string }> = [
  { id: "contact", label: "Contact" },
  { id: "preferences", label: "Needs" },
  { id: "ready", label: "Tour" }
];

const onboardingSteps: Array<{ id: OnboardingStep; label: string }> = [
  { id: "rep", label: "You" },
  { id: "property", label: "Property" },
  { id: "security", label: "Verify" }
];

export default function App() {
  const player = useVideoPlayer(onboardingBackground, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("rep");
  const [tourStep, setTourStep] = useState<TourStep>("contact");
  const [onboarding, setOnboarding] = useState({
    name: leasingAgent.name,
    email: leasingAgent.email,
    phone: leasingAgent.phone,
    property: leasingAgent.property,
    teamInvites: "",
    password: "",
    verificationCode: ""
  });
  const [prospect, setProspect] = useState({
    name: "",
    email: "",
    phone: "",
    moveIn: "",
    bedrooms: "2 bed",
    budget: "$2,200 - $2,600"
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

  const activeOnboardingStepIndex = useMemo(
    () => onboardingSteps.findIndex((step) => step.id === onboardingStep),
    [onboardingStep]
  );
  const activeStepIndex = useMemo(() => tourSteps.findIndex((step) => step.id === tourStep), [tourStep]);

  const updateOnboarding = (key: keyof typeof onboarding, value: string) => {
    setOnboarding((current) => ({ ...current, [key]: value }));
  };

  const updateProspect = (key: keyof typeof prospect, value: string) => {
    setProspect((current) => ({ ...current, [key]: value }));
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {screen === "onboarding" ? (
            <OnboardingScreen
              activeStepIndex={activeOnboardingStepIndex}
              onboarding={onboarding}
              player={player}
              step={onboardingStep}
              onChange={updateOnboarding}
              onFinish={() => setScreen("home")}
              onStepChange={setOnboardingStep}
            />
          ) : null}

          {screen === "home" ? (
            <HomeScreen onOpenProfile={() => setScreen("profile")} onRestartOnboarding={() => setScreen("onboarding")} />
          ) : null}

          {screen === "profile" ? (
            <ProfileScreen
              onBack={() => setScreen("home")}
              onStartTour={() => {
                setTourStep("contact");
                setScreen("tour");
              }}
            />
          ) : null}

          {screen === "tour" ? (
            <TourStepperScreen
              activeStepIndex={activeStepIndex}
              prospect={prospect}
              tourStep={tourStep}
              onBack={() => setScreen("profile")}
              onChange={updateProspect}
              onStepChange={setTourStep}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function OnboardingScreen({
  activeStepIndex,
  onboarding,
  player,
  step,
  onChange,
  onFinish,
  onStepChange
}: {
  activeStepIndex: number;
  onboarding: {
    name: string;
    email: string;
    phone: string;
    property: string;
    teamInvites: string;
    password: string;
    verificationCode: string;
  };
  player: ReturnType<typeof useVideoPlayer>;
  step: OnboardingStep;
  onChange: (key: keyof typeof onboarding, value: string) => void;
  onFinish: () => void;
  onStepChange: (step: OnboardingStep) => void;
}) {
  return (
    <View style={styles.onboardingShell}>
      <VideoView
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="cover"
        nativeControls={false}
        player={player}
        playsInline
        style={styles.onboardingVideo}
      />
      <View style={styles.onboardingScrim} />
      <View style={styles.onboardingContent}>
        <View style={styles.onboardingHeader}>
          <Text style={styles.onboardingEyebrow}>Tour.video onboarding</Text>
          <Text style={styles.onboardingTitle}>Set up your leasing profile.</Text>
          <Text style={styles.onboardingSubtitle}>
            Create the card visitors scan before a tour, attach it to your property, and verify your phone.
          </Text>
        </View>

        <View style={styles.onboardingStepper}>
          {onboardingSteps.map((item, index) => {
            const active = index === activeStepIndex;
            const complete = index < activeStepIndex;
            return (
              <View style={styles.onboardingStepItem} key={item.id}>
                <View
                  style={[
                    styles.onboardingStepDot,
                    active && styles.onboardingStepDotActive,
                    complete && styles.onboardingStepDotComplete
                  ]}
                >
                  <Text style={[styles.onboardingStepDotText, (active || complete) && styles.onboardingStepDotTextActive]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.onboardingStepLabel, active && styles.onboardingStepLabelActive]}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.onboardingCard}>
          {step === "rep" ? (
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Your leasing rep details</Text>
              <TextInput
                placeholder="Name"
                placeholderTextColor="#8a94a6"
                value={onboarding.name}
                onChangeText={(value) => onChange("name", value)}
                style={styles.input}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor="#8a94a6"
                value={onboarding.email}
                onChangeText={(value) => onChange("email", value)}
                style={styles.input}
              />
              <TextInput
                autoComplete="tel"
                keyboardType="phone-pad"
                placeholder="Phone"
                placeholderTextColor="#8a94a6"
                value={onboarding.phone}
                onChangeText={(value) => onChange("phone", value)}
                style={styles.input}
              />
              <PrimaryAction label="Continue to property" onPress={() => onStepChange("property")} />
            </View>
          ) : null}

          {step === "property" ? (
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Property and team</Text>
              <TextInput
                placeholder="Property name"
                placeholderTextColor="#8a94a6"
                value={onboarding.property}
                onChangeText={(value) => onChange("property", value)}
                style={styles.input}
              />
              <TextInput
                multiline
                placeholder="Invite team members by email"
                placeholderTextColor="#8a94a6"
                value={onboarding.teamInvites}
                onChangeText={(value) => onChange("teamInvites", value)}
                style={[styles.input, styles.multilineInput]}
              />
              <PrimaryAction label="Continue to verification" onPress={() => onStepChange("security")} />
            </View>
          ) : null}

          {step === "security" ? (
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Password and phone verification</Text>
              <TextInput
                placeholder="Create password"
                placeholderTextColor="#8a94a6"
                secureTextEntry
                value={onboarding.password}
                onChangeText={(value) => onChange("password", value)}
                style={styles.input}
              />
              <TextInput
                keyboardType="number-pad"
                placeholder="6-digit code"
                placeholderTextColor="#8a94a6"
                value={onboarding.verificationCode}
                onChangeText={(value) => onChange("verificationCode", value)}
                style={styles.input}
              />
              <View style={styles.codeHint}>
                <Text style={styles.codeHintText}>Code sent to {onboarding.phone || leasingAgent.phone}</Text>
              </View>
              <PrimaryAction label="Finish setup" onPress={onFinish} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function HomeScreen({
  onOpenProfile,
  onRestartOnboarding
}: {
  onOpenProfile: () => void;
  onRestartOnboarding: () => void;
}) {
  return (
    <View style={styles.page}>
      <Header eyebrow="Tour home" title="Start every tour with the right contact." />

      <View style={styles.businessCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.avatar}>
            <Text selectable style={styles.avatarText}>
              AJ
            </Text>
          </View>
          <View style={styles.agentHeader}>
            <Text selectable style={styles.agentName}>
              {leasingAgent.name}
            </Text>
            <Text selectable style={styles.agentTitle}>
              {leasingAgent.title} · {leasingAgent.property}
            </Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Ready</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.contactBlock}>
            <ContactLine label="Email" value={leasingAgent.email} />
            <ContactLine label="Phone" value={leasingAgent.phone} />
            <ContactLine label="Profile" value={leasingAgent.profileUrl} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open contact exchange profile"
            onPress={onOpenProfile}
            style={({ pressed }) => [styles.qrCard, pressed && styles.pressed]}
          >
            <QrCode />
            <Text style={styles.qrCaption}>Scan or tap</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onOpenProfile}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Open digital business card</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onRestartOnboarding}
        style={({ pressed }) => [styles.secondarySetupButton, pressed && styles.pressed]}
      >
        <Text style={styles.secondarySetupText}>Review onboarding setup</Text>
      </Pressable>

      <View style={styles.previewPanel}>
        <Text style={styles.panelLabel}>Contact exchange</Text>
        <Text style={styles.panelTitle}>Visitor enters their info, then starts the tour stepper.</Text>
        <View style={styles.miniSteps}>
          {["Card", "Contact", "Needs", "Tour"].map((label, index) => (
            <View style={styles.miniStep} key={label}>
              <View style={[styles.miniStepDot, index === 0 && styles.miniStepDotActive]} />
              <Text style={styles.miniStepText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ProfileScreen({ onBack, onStartTour }: { onBack: () => void; onStartTour: () => void }) {
  return (
    <View style={styles.page}>
      <BackButton label="Card" onPress={onBack} />
      <View style={styles.profileHero}>
        <View style={styles.avatarLarge}>
          <Text selectable style={styles.avatarLargeText}>
            AJ
          </Text>
        </View>
        <Text selectable style={styles.profileName}>
          {leasingAgent.name}
        </Text>
        <Text selectable style={styles.profileTitle}>
          {leasingAgent.title} at {leasingAgent.property}
        </Text>

        <View style={styles.profileContactCard}>
          <ContactLine label="Email" value={leasingAgent.email} />
          <ContactLine label="Phone" value={leasingAgent.phone} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onStartTour}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Exchange contact and start tour</Text>
        </Pressable>
      </View>

      <View style={styles.profileNote}>
        <Text style={styles.panelLabel}>Link in bio profile</Text>
        <Text style={styles.bodyText}>
          This is the page the QR code points to. The visitor confirms the leasing rep, enters contact info, and starts the guided tour.
        </Text>
      </View>
    </View>
  );
}

function TourStepperScreen({
  activeStepIndex,
  prospect,
  tourStep,
  onBack,
  onChange,
  onStepChange
}: {
  activeStepIndex: number;
  prospect: {
    name: string;
    email: string;
    phone: string;
    moveIn: string;
    bedrooms: string;
    budget: string;
  };
  tourStep: TourStep;
  onBack: () => void;
  onChange: (key: keyof typeof prospect, value: string) => void;
  onStepChange: (step: TourStep) => void;
}) {
  return (
    <View style={styles.page}>
      <BackButton label="Profile" onPress={onBack} />
      <View style={styles.agentStrip}>
        <View style={styles.avatarSmall}>
          <Text selectable style={styles.avatarSmallText}>
            AJ
          </Text>
        </View>
        <View style={styles.agentStripText}>
          <Text selectable style={styles.agentStripName}>
            {leasingAgent.name}
          </Text>
          <Text selectable style={styles.agentStripContact}>
            {leasingAgent.email} · {leasingAgent.phone}
          </Text>
        </View>
      </View>

      <View style={styles.stepper}>
        {tourSteps.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isComplete = index < activeStepIndex;
          return (
            <View style={styles.stepItem} key={step.id}>
              <View
                style={[
                  styles.stepDot,
                  isComplete && styles.stepDotComplete,
                  isActive && styles.stepDotActive
                ]}
              >
                <Text style={[styles.stepDotText, (isActive || isComplete) && styles.stepDotTextActive]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{step.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.formCard}>
        {tourStep === "contact" ? (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Your contact information</Text>
            <TextInput
              placeholder="Full name"
              placeholderTextColor="#8a94a6"
              value={prospect.name}
              onChangeText={(value) => onChange("name", value)}
              style={styles.input}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#8a94a6"
              value={prospect.email}
              onChangeText={(value) => onChange("email", value)}
              style={styles.input}
            />
            <TextInput
              autoComplete="tel"
              keyboardType="phone-pad"
              placeholder="Phone"
              placeholderTextColor="#8a94a6"
              value={prospect.phone}
              onChangeText={(value) => onChange("phone", value)}
              style={styles.input}
            />
            <PrimaryAction label="Continue to preferences" onPress={() => onStepChange("preferences")} />
          </View>
        ) : null}

        {tourStep === "preferences" ? (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>What should the tour focus on?</Text>
            <TextInput
              placeholder="Target move-in date"
              placeholderTextColor="#8a94a6"
              value={prospect.moveIn}
              onChangeText={(value) => onChange("moveIn", value)}
              style={styles.input}
            />
            <SegmentedChoices
              label="Bedrooms"
              options={["Studio", "1 bed", "2 bed", "3 bed"]}
              value={prospect.bedrooms}
              onChange={(value) => onChange("bedrooms", value)}
            />
            <SegmentedChoices
              label="Budget"
              options={["<$2,000", "$2,200 - $2,600", "$2,600+"]}
              value={prospect.budget}
              onChange={(value) => onChange("budget", value)}
            />
            <PrimaryAction label="Review and start tour" onPress={() => onStepChange("ready")} />
          </View>
        ) : null}

        {tourStep === "ready" ? (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Ready to start the guided tour</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label="Prospect" value={prospect.name || "Guest visitor"} />
              <SummaryRow label="Contact" value={prospect.email || prospect.phone || "Not provided"} />
              <SummaryRow label="Tour focus" value={`${prospect.bedrooms} · ${prospect.budget}`} />
              <SummaryRow label="Move-in" value={prospect.moveIn || "Flexible"} />
            </View>
            <Pressable style={({ pressed }) => [styles.startTourButton, pressed && styles.pressed]}>
              <Text style={styles.startTourText}>Start tour</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ContactLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.contactLine}>
      <Text style={styles.contactLabel}>{label}</Text>
      <Text selectable style={styles.contactValue}>
        {value}
      </Text>
    </View>
  );
}

function QrCode() {
  return (
    <View style={styles.qrGrid}>
      {qrRows.map((row, rowIndex) =>
        row.split("").map((cell, columnIndex) => (
          <View
            key={`${rowIndex}-${columnIndex}`}
            style={[
              styles.qrCell,
              cell === "1" ? styles.qrCellDark : styles.qrCellLight
            ]}
          />
        ))
      )}
    </View>
  );
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
      <Text style={styles.backButtonText}>‹ {label}</Text>
    </Pressable>
  );
}

function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SegmentedChoices({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => onChange(option)}
              style={[styles.choicePill, selected && styles.choicePillActive]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text selectable style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#f4f7fb",
    flex: 1
  },
  keyboardView: {
    flex: 1
  },
  scrollContent: {
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 64
  },
  onboardingShell: {
    borderCurve: "continuous",
    borderRadius: 34,
    minHeight: 760,
    overflow: "hidden"
  },
  onboardingVideo: {
    ...StyleSheet.absoluteFillObject
  },
  onboardingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 18, 38, 0.58)"
  },
  onboardingContent: {
    gap: 18,
    minHeight: 760,
    padding: 18,
    justifyContent: "flex-end"
  },
  onboardingHeader: {
    gap: 10,
    paddingTop: 40
  },
  onboardingEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  onboardingTitle: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 40
  },
  onboardingSubtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23
  },
  onboardingStepper: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.18)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12
  },
  onboardingStepItem: {
    alignItems: "center",
    flex: 1,
    gap: 8
  },
  onboardingStepDot: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  onboardingStepDotActive: {
    backgroundColor: "#ffffff"
  },
  onboardingStepDotComplete: {
    backgroundColor: "#16a34a"
  },
  onboardingStepDotText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingStepDotTextActive: {
    color: "#101828"
  },
  onboardingStepLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "900"
  },
  onboardingStepLabelActive: {
    color: "#ffffff"
  },
  onboardingCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderCurve: "continuous",
    borderRadius: 30,
    padding: 18
  },
  page: {
    gap: 18
  },
  header: {
    gap: 8
  },
  eyebrow: {
    color: "#006ce5",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: "#101828",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 38
  },
  businessCard: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 28,
    borderWidth: 1,
    gap: 22,
    padding: 20
  },
  cardTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#e9f2ff",
    borderRadius: 18,
    height: 54,
    justifyContent: "center",
    width: 54
  },
  avatarText: {
    color: "#006ce5",
    fontSize: 17,
    fontWeight: "900"
  },
  agentHeader: {
    flex: 1,
    gap: 3
  },
  agentName: {
    color: "#101828",
    fontSize: 20,
    fontWeight: "800"
  },
  agentTitle: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "600"
  },
  livePill: {
    alignItems: "center",
    backgroundColor: "#eefaf3",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  liveDot: {
    backgroundColor: "#16a34a",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  liveText: {
    color: "#0f7a3b",
    fontSize: 12,
    fontWeight: "800"
  },
  cardBody: {
    flexDirection: "row",
    gap: 16
  },
  contactBlock: {
    flex: 1,
    gap: 12
  },
  contactLine: {
    gap: 4
  },
  contactLabel: {
    color: "#8a94a6",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  contactValue: {
    color: "#182230",
    fontSize: 14,
    fontWeight: "700"
  },
  qrCard: {
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderColor: "#d7e7ff",
    borderCurve: "continuous",
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    justifyContent: "center",
    padding: 12,
    width: 132
  },
  qrGrid: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    padding: 8,
    width: 104
  },
  qrCell: {
    borderRadius: 1,
    height: 4,
    width: 4
  },
  qrCellDark: {
    backgroundColor: "#101828"
  },
  qrCellLight: {
    backgroundColor: "#ffffff"
  },
  qrCaption: {
    color: "#006ce5",
    fontSize: 12,
    fontWeight: "800"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#006ce5",
    borderCurve: "continuous",
    borderRadius: 18,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  secondarySetupButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: "center"
  },
  secondarySetupText: {
    color: "#344054",
    fontSize: 15,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }]
  },
  previewPanel: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  panelLabel: {
    color: "#006ce5",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  panelTitle: {
    color: "#101828",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25
  },
  miniSteps: {
    flexDirection: "row",
    gap: 10
  },
  miniStep: {
    alignItems: "center",
    flex: 1,
    gap: 6
  },
  miniStepDot: {
    backgroundColor: "#d5deea",
    borderRadius: 999,
    height: 8,
    width: "100%"
  },
  miniStepDotActive: {
    backgroundColor: "#006ce5"
  },
  miniStepText: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800"
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  backButtonText: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "800"
  },
  profileHero: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 32,
    borderWidth: 1,
    gap: 14,
    padding: 22
  },
  avatarLarge: {
    alignItems: "center",
    backgroundColor: "#e9f2ff",
    borderRadius: 30,
    height: 84,
    justifyContent: "center",
    width: 84
  },
  avatarLargeText: {
    color: "#006ce5",
    fontSize: 26,
    fontWeight: "900"
  },
  profileName: {
    color: "#101828",
    fontSize: 28,
    fontWeight: "900"
  },
  profileTitle: {
    color: "#667085",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center"
  },
  profileContactCard: {
    alignSelf: "stretch",
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    gap: 12,
    padding: 16
  },
  profileNote: {
    backgroundColor: "#eaf4ff",
    borderCurve: "continuous",
    borderRadius: 24,
    gap: 8,
    padding: 18
  },
  bodyText: {
    color: "#344054",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23
  },
  agentStrip: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  avatarSmall: {
    alignItems: "center",
    backgroundColor: "#e9f2ff",
    borderRadius: 16,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  avatarSmallText: {
    color: "#006ce5",
    fontSize: 15,
    fontWeight: "900"
  },
  agentStripText: {
    flex: 1,
    gap: 3
  },
  agentStripName: {
    color: "#101828",
    fontSize: 17,
    fontWeight: "900"
  },
  agentStripContact: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700"
  },
  stepper: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14
  },
  stepItem: {
    alignItems: "center",
    flex: 1,
    gap: 8
  },
  stepDot: {
    alignItems: "center",
    backgroundColor: "#eef2f7",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  stepDotActive: {
    backgroundColor: "#006ce5"
  },
  stepDotComplete: {
    backgroundColor: "#16a34a"
  },
  stepDotText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "900"
  },
  stepDotTextActive: {
    color: "#ffffff"
  },
  stepLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800"
  },
  stepLabelActive: {
    color: "#101828"
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(16, 24, 40, 0.08)",
    borderCurve: "continuous",
    borderRadius: 30,
    borderWidth: 1,
    padding: 18
  },
  formSection: {
    gap: 14
  },
  formTitle: {
    color: "#101828",
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#d7dee8",
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: 1,
    color: "#101828",
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 14
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 14,
    textAlignVertical: "top"
  },
  codeHint: {
    backgroundColor: "#eaf4ff",
    borderCurve: "continuous",
    borderRadius: 16,
    padding: 12
  },
  codeHintText: {
    color: "#006ce5",
    fontSize: 13,
    fontWeight: "800"
  },
  choiceGroup: {
    gap: 10
  },
  choiceLabel: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "900"
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choicePill: {
    backgroundColor: "#f5f7fb",
    borderColor: "#d7dee8",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  choicePillActive: {
    backgroundColor: "#eaf4ff",
    borderColor: "#006ce5"
  },
  choiceText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "800"
  },
  choiceTextActive: {
    color: "#006ce5"
  },
  summaryCard: {
    backgroundColor: "#f8fafc",
    borderCurve: "continuous",
    borderRadius: 22,
    gap: 12,
    padding: 16
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  summaryLabel: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "800"
  },
  summaryValue: {
    color: "#101828",
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right"
  },
  startTourButton: {
    alignItems: "center",
    backgroundColor: "#101828",
    borderCurve: "continuous",
    borderRadius: 18,
    minHeight: 56,
    justifyContent: "center"
  },
  startTourText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  }
});
