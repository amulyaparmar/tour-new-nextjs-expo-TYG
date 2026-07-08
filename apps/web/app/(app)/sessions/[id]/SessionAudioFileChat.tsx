"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GEMINI_AUDIO_MODEL,
  GEMINI_AUDIO_MODELS,
  normalizeGeminiAudioModelId,
  type GeminiAudioModelId,
} from "@tour/shared";
import { ArrowUp, Loader2 } from "lucide-react";

import { AiChatModelSelect } from "./AiChatModelSelect";
import { AiChatMarkdown } from "./AiChatMarkdown";
import styles from "./session-detail.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const STARTER_PROMPTS = [
  {
    label: "Emotional signals & tone",
    text: "What were the important emotional signals in this session? When were the emotional turning points, and how would you describe the leasing agent's tone?",
  },
  {
    label: "Prospect objections",
    text: "What objections did the prospect raise?",
  },
  {
    label: "Closing attempts",
    text: "Summarize the agent's closing attempts.",
  },
];

export function SessionAudioFileChat({
  sessionId,
  defaultModel = DEFAULT_GEMINI_AUDIO_MODEL,
  initialAudioFileExpiresAt,
  onSeek,
}: {
  sessionId: string;
  defaultModel?: string;
  initialAudioFileExpiresAt?: string;
  onSeek?: (seconds: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState<GeminiAudioModelId>(
    normalizeGeminiAudioModelId(defaultModel)
  );
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Analyzing audio...");
  const [audioFileExpiresAt, setAudioFileExpiresAt] = useState<string | undefined>(
    initialAudioFileExpiresAt
  );
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setModel(normalizeGeminiAudioModelId(defaultModel));
  }, [defaultModel]);

  useEffect(() => {
    setAudioFileExpiresAt(initialAudioFileExpiresAt);
  }, [initialAudioFileExpiresAt]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isBusy, scrollToBottom]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input]);

  const sendMessages = useCallback(
    async (nextMessages: ChatMessage[]) => {
      setIsBusy(true);
      setError(null);
      setBusyLabel(isAudioFileExpired(audioFileExpiresAt)
        ? "Re-indexing audio. This can take a moment..."
        : "Analyzing audio...");

      try {
        const response = await fetch(`/api/sessions/${sessionId}/audio-insights/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: nextMessages.map(({ role, content }) => ({ role, content })),
          }),
        });

        const body = (await response.json()) as {
          reply?: string;
          error?: string;
          audioFileExpiresAt?: string | null;
          audioFileRefreshed?: boolean;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Failed to get a response.");
        }
        if (!body.reply?.trim()) {
          throw new Error("Gemini returned an empty response.");
        }
        if (body.audioFileExpiresAt) {
          setAudioFileExpiresAt(body.audioFileExpiresAt);
        }

        setMessages([
          ...nextMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: body.reply.trim(),
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setMessages(nextMessages.slice(0, -1));
      } finally {
        setIsBusy(false);
        inputRef.current?.focus();
      }
    },
    [audioFileExpiresAt, model, sessionId]
  );

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };

      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");
      void sendMessages(nextMessages);
    },
    [isBusy, messages, sendMessages]
  );

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    submitText(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className={styles.audioFileChat}>
      <div className={styles.audioFileChatHead}>
        <p className={styles.audioFileChatHint}>
          Ask Gemini about tone, pacing, and moments in the recording. Answers are grounded in the uploaded audio file.
        </p>
        {messages.length > 0 && (
          <button
            type="button"
            className={styles.aiChatClear}
            disabled={isBusy}
            onClick={clearConversation}
          >
            Clear
          </button>
        )}
      </div>

      <AiChatModelSelect
        id={`audio-chat-model-${sessionId}`}
        value={model}
        onChange={(value) => setModel(normalizeGeminiAudioModelId(value))}
        options={GEMINI_AUDIO_MODELS.map((option) => ({
          id: option.id,
          label: option.label,
        }))}
        disabled={isBusy}
      />

      <div className={`${styles.aiChatList} ${styles.audioFileChatList}`} ref={listRef}>
        {messages.length === 0 ? (
          <div className={styles.audioFileChatStarters}>
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                className={styles.aiPrompt}
                disabled={isBusy}
                onClick={() => submitText(prompt.text)}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.aiChatMessage} ${
                message.role === "user" ? styles.aiChatMessageUser : styles.aiChatMessageAssistant
              }`}
            >
              <span className={styles.aiChatRole}>
                {message.role === "user" ? "You" : "Recording"}
              </span>
              <div className={styles.aiChatBubble}>
                {message.role === "assistant" ? (
                  <>
                    <AiChatMarkdown content={message.content} onSeek={onSeek} />
                    {isBusy &&
                      message.id === messages[messages.length - 1]?.id &&
                      !message.content && (
                        <span className={styles.aiChatTyping}>Listening…</span>
                      )}
                  </>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))
        )}

        {isBusy && messages.at(-1)?.role === "user" && (
          <div className={`${styles.aiChatMessage} ${styles.aiChatMessageAssistant}`}>
            <span className={styles.aiChatRole}>Recording</span>
            <div className={styles.aiChatBubble}>
              <span className={styles.aiChatTyping}>
                <Loader2 size={14} className={styles.aiChatSpinner} aria-hidden />
                {busyLabel}
              </span>
            </div>
          </div>
        )}

        {error && <div className={styles.aiChatError}>{error}</div>}
      </div>

      <form className={styles.audioFileChatForm} onSubmit={handleSubmit}>
        <div className={styles.aiChatInputWrap}>
          <textarea
            ref={inputRef}
            className={styles.aiChatInput}
            value={input}
            rows={1}
            placeholder="Ask about this recording…"
            disabled={isBusy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className={styles.aiChatSend}
            disabled={!input.trim() || isBusy}
            aria-label="Send message"
          >
            {isBusy ? <Loader2 size={16} className={styles.aiChatSpinner} /> : <ArrowUp size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}

function isAudioFileExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return true;
  return parsed - 10 * 60 * 1000 <= Date.now();
}
