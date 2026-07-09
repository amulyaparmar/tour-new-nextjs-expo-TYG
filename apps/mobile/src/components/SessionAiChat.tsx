import type { AnalysisResult } from "@tour/shared";
import { ArrowUp } from "lucide-react-native";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiBaseUrl } from "../config";
import { getCurrentSession } from "../auth";
import {
  filterMentionPrompts,
  SESSION_AI_DEFAULT_PROMPTS,
  type SessionAiPrompt,
} from "../session-ai-prompts";
import { AiChatText } from "./AiChatText";
import { Icon } from "@/components/ui/icon";

const C = {
  brand: "#006CE5",
  brandSoft: "#EAF4FF",
  text: "#101828",
  textSec: "#667085",
  textMuted: "#94A3B8",
  border: "rgba(16, 24, 40, 0.08)",
  card: "#FFFFFF",
};

function messageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

type Props = {
  sessionId: string;
  analysis: AnalysisResult;
  onSeek?: (seconds: number) => void;
  showHeader?: boolean;
  bottomInset?: number;
};

export function SessionAiChat({ sessionId, analysis, onSeek, showHeader = true, bottomInset = 0 }: Props) {
  const [input, setInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const listRef = useRef<ScrollView>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${getApiBaseUrl()}/api/sessions/${sessionId}/chat`,
        headers: (): Record<string, string> => {
          const session = getCurrentSession();
          if (!session) return {};
          return {
            Authorization: `Bearer ${session.accessToken}`,
            "x-admin-community-id": session.workspace.community.id,
            "x-tour-client": "mobile",
          };
        },
      }),
    [sessionId]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({ transport });
  const isBusy = status === "submitted" || status === "streaming";
  const mentionOptions = mentionQuery != null ? filterMentionPrompts(mentionQuery) : [];

  const coachingPoints = useMemo(
    () =>
      [
        ...analysis.opportunities.slice(0, 2).map((item, index) => ({
          title: `Opportunity ${index + 1}`,
          body: item,
        })),
        ...analysis.strengths.slice(0, 2).map((item, index) => ({
          title: `Strength ${index + 1}`,
          body: item,
        })),
      ].slice(0, 4),
    [analysis]
  );

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, status]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      void sendMessage({ text: trimmed });
      setInput("");
      setMentionQuery(null);
    },
    [isBusy, sendMessage]
  );

  const insertPrompt = useCallback(
    (prompt: SessionAiPrompt) => {
      if (mentionQuery != null) {
        const atIndex = input.lastIndexOf("@");
        const prefix = atIndex >= 0 ? input.slice(0, atIndex) : "";
        setInput(`${prefix}${prompt.text}`.trimStart());
        setMentionQuery(null);
      } else {
        setInput(prompt.text);
      }
    },
    [input, mentionQuery]
  );

  function handleInputChange(value: string) {
    setInput(value);
    const atMatch = /(?:^|\s)@([\w-]*)$/.exec(value);
    if (atMatch) {
      setMentionQuery(atMatch[1] ?? "");
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={120}
    >
      <View style={[styles.head, !showHeader && styles.headHidden]}>
        {showHeader ? (
          <>
            <Text style={styles.title}>Tour AI</Text>
            {messages.length > 0 && (
              <Pressable disabled={isBusy} onPress={() => setMessages([])}>
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            )}
          </>
        ) : null}
      </View>

      <ScrollView ref={listRef} style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: 8 + bottomInset }]} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <View style={styles.starter}>
            {coachingPoints.map((point) => (
              <View key={point.title} style={styles.card}>
                <Text style={styles.cardTitle}>{point.title}</Text>
                <Text style={styles.cardBody}>{point.body}</Text>
              </View>
            ))}
            <Text style={styles.hint}>Ask about this tour, or type @ for preset prompts.</Text>
          </View>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[styles.message, message.role === "user" ? styles.messageUser : styles.messageAssistant]}
            >
              <Text style={styles.role}>{message.role === "user" ? "You" : "Tour AI"}</Text>
              {message.role === "assistant" ? (
                <>
                  <AiChatText content={messageText(message.parts)} onSeek={onSeek} />
                  {isBusy &&
                    message.id === messages[messages.length - 1]?.id &&
                    !messageText(message.parts) && (
                      <Text style={styles.typing}>Thinking...</Text>
                    )}
                </>
              ) : (
                <Text style={styles.userText}>{messageText(message.parts)}</Text>
              )}
            </View>
          ))
        )}
        {error && <Text style={styles.error}>{error.message || "Something went wrong."}</Text>}
      </ScrollView>

      <View style={styles.composer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prompts}>
          {SESSION_AI_DEFAULT_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt.id}
              disabled={isBusy}
              onPress={() => submitText(prompt.text)}
              style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.promptText}>{prompt.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputWrap}>
          {mentionQuery != null && mentionOptions.length > 0 && (
            <View style={styles.mentionMenu}>
              {mentionOptions.slice(0, 6).map((prompt, index) => (
                <Pressable
                  key={prompt.id}
                  onPress={() => insertPrompt(prompt)}
                  style={[styles.mentionItem, index === mentionIndex && styles.mentionItemActive]}
                >
                  <Text style={styles.mentionLabel}>@{prompt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            value={input}
            onChangeText={handleInputChange}
            placeholder="Ask about this tour…"
            placeholderTextColor={C.textMuted}
            style={styles.input}
            multiline
            editable={!isBusy}
          />
          <Pressable
            disabled={!input.trim() || isBusy}
            onPress={() => submitText(input)}
            style={[styles.send, (!input.trim() || isBusy) && styles.sendDisabled]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon as={ArrowUp} size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  headHidden: { minHeight: 0, height: 0, overflow: "hidden" },
  title: { fontSize: 17, fontWeight: "900", color: C.text },
  clear: { fontSize: 13, fontWeight: "700", color: C.brand },
  list: { flex: 1 },
  listContent: { gap: 10, paddingBottom: 8 },
  starter: { gap: 10 },
  card: {
    backgroundColor: C.brandSoft,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontSize: 12, fontWeight: "900", color: C.brand },
  cardBody: { fontSize: 13, fontWeight: "600", color: C.text, lineHeight: 20 },
  hint: { fontSize: 12, fontWeight: "600", color: C.textMuted },
  message: { borderRadius: 12, padding: 12, gap: 4 },
  messageUser: { backgroundColor: C.brandSoft, alignSelf: "flex-end", maxWidth: "92%" },
  messageAssistant: { backgroundColor: "#f8fafc", alignSelf: "flex-start", maxWidth: "96%" },
  role: { fontSize: 10, fontWeight: "900", color: C.textMuted, textTransform: "uppercase" },
  userText: { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 20 },
  typing: { fontSize: 13, fontWeight: "600", color: C.textMuted, fontStyle: "italic" },
  error: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
  composer: { gap: 8, paddingTop: 4 },
  prompts: { gap: 8, paddingBottom: 4 },
  prompt: {
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promptText: { fontSize: 12, fontWeight: "700", color: C.textSec },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
  },
  mentionMenu: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: "100%",
    marginBottom: 6,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    zIndex: 10,
  },
  mentionItem: { paddingHorizontal: 12, paddingVertical: 10 },
  mentionItemActive: { backgroundColor: C.brandSoft },
  mentionLabel: { fontSize: 13, fontWeight: "700", color: C.text },
  input: { flex: 1, fontSize: 15, fontWeight: "600", color: C.text, maxHeight: 100, minHeight: 36 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
});
