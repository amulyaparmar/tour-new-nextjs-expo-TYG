"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult } from "@tour/shared";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2 } from "lucide-react";

import { AiChatMarkdown } from "./AiChatMarkdown";
import styles from "./session-detail.module.css";
import {
  filterMentionPrompts,
  SESSION_AI_DEFAULT_PROMPTS,
  type SessionAiPrompt,
} from "./session-ai-prompts";

type SessionAiMessages = ReturnType<typeof useChat>["messages"];

function messageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

export function SessionAiChat({
  sessionId,
  analysis,
  onSeek,
}: {
  sessionId: string;
  analysis: AnalysisResult;
  onSeek?: (seconds: number) => void;
}) {
  const [input, setInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [savedMessages, setSavedMessages] = useState<SessionAiMessages | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/api/sessions/${sessionId}/chat` }),
    [sessionId]
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({ transport });

  const isBusy = status === "submitted" || status === "streaming";
  const mentionOptions = mentionQuery != null ? filterMentionPrompts(mentionQuery) : [];

  const coachingPoints = useMemo(
    () => [
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

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const resetInputHeight = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el || el.offsetParent === null) return;
      el.style.height = "auto";
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, status, scrollToBottom]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      void sendMessage({ text: trimmed });
      setInput("");
      setMentionQuery(null);
      resetInputHeight();
    },
    [isBusy, resetInputHeight, sendMessage]
  );

  const clearConversation = useCallback(() => {
    const chatToResume = messages.length > 0 ? messages : savedMessages;
    if (chatToResume?.length) {
      setSavedMessages(chatToResume);
    }
    setMessages([]);
    setInput("");
    setMentionQuery(null);
    setMentionIndex(0);
    resetInputHeight();
    inputRef.current?.focus();
  }, [messages, resetInputHeight, savedMessages, setMessages]);

  const resumeSavedConversation = useCallback(() => {
    if (!savedMessages?.length) return;
    setMessages(savedMessages);
    inputRef.current?.focus();
  }, [savedMessages, setMessages]);

  const insertPrompt = useCallback((prompt: SessionAiPrompt) => {
    if (mentionQuery != null) {
      const atIndex = input.lastIndexOf("@");
      const prefix = atIndex >= 0 ? input.slice(0, atIndex) : "";
      setInput(`${prefix}${prompt.text}`.trimStart());
      setMentionQuery(null);
    } else {
      setInput(prompt.text);
    }
    inputRef.current?.focus();
  }, [input, mentionQuery]);

  const handleInputChange = (value: string) => {
    setInput(value);
    const atMatch = /(?:^|\s)@([\w-]*)$/.exec(value);
    if (atMatch) {
      setMentionQuery(atMatch[1] ?? "");
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    submitText(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery != null && mentionOptions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionOptions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const prompt = mentionOptions[mentionIndex];
        if (prompt) insertPrompt(prompt);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={styles.aiPanel}>
      <div className={styles.sidebarSectionHead}>
        <h2>Tour AI</h2>
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

      <div className={styles.aiChatList} ref={listRef}>
        {messages.length === 0 ? (
          <div className={styles.aiStarter}>
            {coachingPoints.map((point) => (
              <div key={point.title} className={styles.aiCard}>
                <strong>{point.title}</strong>
                <p>{point.body}</p>
              </div>
            ))}
            <p className={styles.aiChatHint}>
              Ask anything about this tour, or type <kbd>@</kbd> to insert a preset prompt.
            </p>
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
                {message.role === "user" ? "You" : "Tour AI"}
              </span>
              <div className={styles.aiChatBubble}>
                {message.role === "assistant" ? (
                  <>
                    <AiChatMarkdown content={messageText(message.parts)} onSeek={onSeek} />
                    {isBusy &&
                      message.id === messages[messages.length - 1]?.id &&
                      !messageText(message.parts) && (
                        <span className={styles.aiChatTyping}>Thinking...</span>
                      )}
                  </>
                ) : (
                  messageText(message.parts)
                )}
              </div>
            </div>
          ))
        )}

        {error && (
          <div className={styles.aiChatError}>
            {error.message || "Something went wrong. Try again."}
          </div>
        )}
      </div>

      <div className={styles.aiChatComposer}>
        {messages.length === 0 && savedMessages && (
          <button
            type="button"
            className={styles.aiResumeInline}
            onClick={resumeSavedConversation}
          >
            <span>Continue last chat</span>
            <strong>{savedMessages.length} messages</strong>
          </button>
        )}

        <div className={styles.aiPrompts}>
          {SESSION_AI_DEFAULT_PROMPTS.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              className={styles.aiPrompt}
              disabled={isBusy}
              onClick={() => submitText(prompt.text)}
            >
              {prompt.label}
            </button>
          ))}
        </div>

        <form className={styles.aiChatForm} onSubmit={handleSubmit}>
          <div className={styles.aiChatInputWrap}>
            {mentionQuery != null && mentionOptions.length > 0 && (
              <div className={styles.aiMentionMenu} role="listbox">
                {mentionOptions.map((prompt, index) => (
                  <button
                    key={prompt.id}
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={`${styles.aiMentionItem} ${index === mentionIndex ? styles.aiMentionItemActive : ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertPrompt(prompt);
                    }}
                  >
                    <span className={styles.aiMentionLabel}>@{prompt.label}</span>
                    <span className={styles.aiMentionDesc}>{prompt.description}</span>
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              className={styles.aiChatInput}
              value={input}
              rows={1}
              placeholder="Ask about this tour… type @ for prompts"
              disabled={isBusy}
              onChange={(event) => handleInputChange(event.target.value)}
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
    </div>
  );
}
