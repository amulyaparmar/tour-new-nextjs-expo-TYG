import { StatusBar } from "expo-status-bar";
import { tourMetrics, tourWorkspace } from "@tour/shared";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

const items = [
  "Review AI summary from Downtown leasing walkthrough",
  "Update approved studio apartment talk track",
  "Share follow-up media with prospect"
];

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>{tourWorkspace.name}</Text>
        <Text style={styles.title}>Today's tour workspace</Text>

        <View style={styles.metrics}>
          {tourMetrics.slice(0, 3).map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.shortLabel}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI recording notes</Text>
          <Text style={styles.cardCopy}>
            Capture tour transcripts, objections, questions, and follow-up tasks.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next actions</Text>
          {items.map((item) => (
            <Text key={item} style={styles.listItem}>
              {item}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f6f8fb",
    flex: 1
  },
  container: {
    gap: 16,
    padding: 20
  },
  eyebrow: {
    color: "#087f8c",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#172033",
    fontSize: 30,
    fontWeight: "800"
  },
  metrics: {
    flexDirection: "row",
    gap: 10
  },
  metricCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 14
  },
  metricValue: {
    color: "#172033",
    fontSize: 24,
    fontWeight: "800"
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18
  },
  cardTitle: {
    color: "#172033",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
  },
  cardCopy: {
    color: "#64748b",
    fontSize: 15,
    lineHeight: 22
  },
  listItem: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 12
  }
});
