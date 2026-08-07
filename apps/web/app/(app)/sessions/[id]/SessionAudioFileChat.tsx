"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendDictationText,
  DEFAULT_GEMINI_AUDIO_MODEL,
  GEMINI_AUDIO_MODELS,
  normalizeGeminiAudioModelId,
  type GeminiAudioFileRef,
  type GeminiAudioModelId,
} from "@tour/shared";
import { ArrowUp, Loader2 } from "lucide-react";

import { AiChatModelSelect } from "./AiChatModelSelect";
import { AiChatMarkdown } from "./AiChatMarkdown";
import { ElevenLabsDictationButton } from "@/components/ElevenLabsDictationButton";
import styles from "./session-detail.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type AudioChatPrompt = {
  label: string;
  text: string;
};

type CoachingPoint = {
  title: string;
  body: string;
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
  model: controlledModel,
  onModelChange,
  showModelSelect = true,
  coachingPoints = [],
  starterPrompts = STARTER_PROMPTS,
  assistantLabel = "Tour AI",
  onSeek,
}: {
  sessionId: string;
  defaultModel?: string;
  model?: GeminiAudioModelId;
  onModelChange?: (model: GeminiAudioModelId) => void;
  showModelSelect?: boolean;
  coachingPoints?: CoachingPoint[];
  starterPrompts?: readonly AudioChatPrompt[];
  assistantLabel?: string;
  onSeek?: (seconds: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uncontrolledModel, setUncontrolledModel] =
    useState<GeminiAudioModelId>(normalizeGeminiAudioModelId(defaultModel));
  const model = controlledModel ?? uncontrolledModel;
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Analyzing audio...");
  const [audioFile, setAudioFile] = useState<GeminiAudioFileRef | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!controlledModel)
      setUncontrolledModel(normalizeGeminiAudioModelId(defaultModel));
  }, [controlledModel, defaultModel]);

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
      setBusyLabel(
        audioFile && isAudioFileExpired(audioFile.expiresAt)
          ? "Refreshing audio. This can take a moment..."
          : "Analyzing audio...",
      );

      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/audio-insights/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: nextMessages.map(({ role, content }) => ({
                role,
                content,
              })),
              audioFile,
            }),
          },
        );

        const body = (await response.json()) as {
          reply?: string;
          error?: string;
          audioFile?: GeminiAudioFileRef;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Failed to get a response.");
        }
        if (!body.reply?.trim()) {
          throw new Error("Gemini returned an empty response.");
        }
        if (body.audioFile) setAudioFile(body.audioFile);

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
    [audioFile, model, sessionId],
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
    [isBusy, messages, sendMessages],
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
          Ask Gemini about tone, pacing, and moments in the recording. Answers
          are grounded in the uploaded audio file.
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

      {showModelSelect && (
        <AiChatModelSelect
          id={`audio-chat-model-${sessionId}`}
          value={model}
          onChange={(value) => {
            const nextModel = normalizeGeminiAudioModelId(value);
            if (controlledModel) onModelChange?.(nextModel);
            else setUncontrolledModel(nextModel);
          }}
          options={GEMINI_AUDIO_MODELS.map((option) => ({
            id: option.id,
            label: option.label,
          }))}
          disabled={isBusy}
        />
      )}

      <div
        className={`${styles.aiChatList} ${styles.audioFileChatList}`}
        ref={listRef}
      >
        {messages.length === 0 ? (
          <div className={styles.aiStarter}>
            {coachingPoints.map((point) => (
              <div key={point.title} className={styles.aiCard}>
                <strong>{point.title}</strong>
                <p>{point.body}</p>
              </div>
            ))}
            <p className={styles.aiChatHint}>
              Ask anything about this tour. Gemini can also use the recording
              for tone, pacing, and moments.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.aiChatMessage} ${
                message.role === "user"
                  ? styles.aiChatMessageUser
                  : styles.aiChatMessageAssistant
              }`}
            >
              <span className={styles.aiChatRole}>
                {message.role === "user" ? "You" : assistantLabel}
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
          <div
            className={`${styles.aiChatMessage} ${styles.aiChatMessageAssistant}`}
          >
            <span className={styles.aiChatRole}>{assistantLabel}</span>
            <div className={styles.aiChatBubble}>
              <span className={styles.aiChatTyping}>
                <Loader2
                  size={14}
                  className={styles.aiChatSpinner}
                  aria-hidden
                />
                {busyLabel}
              </span>
            </div>
          </div>
        )}

        {(error || dictationError) && (
          <div className={styles.aiChatError}>{dictationError || error}</div>
        )}
      </div>

      <form className={styles.audioFileChatForm} onSubmit={handleSubmit}>
        <div className={styles.aiPrompts}>
          {starterPrompts.map((prompt) => (
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
          <ElevenLabsDictationButton
            disabled={isBusy}
            onError={setDictationError}
            onTranscript={(text) => {
              setInput((current) => appendDictationText(current, text));
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
          <button
            type="submit"
            className={styles.aiChatSend}
            disabled={!input.trim() || isBusy}
            aria-label="Send message"
          >
            {isBusy ? (
              <Loader2 size={16} className={styles.aiChatSpinner} />
            ) : (
              <ArrowUp size={16} />
            )}
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
