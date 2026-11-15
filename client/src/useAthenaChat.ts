// The Ask Athena conversation, kept OUTSIDE the Athena page (in App),
// so it survives switching pages, and saved on this device so it survives a refresh.
// It's only cleared when you press "New chat".

import { useEffect, useState } from "react";

export type AthenaMessage = {
  role: "user" | "athena";
  text: string;
  sql?: string | null; // the query Athena ran (not shown; sent back so follow-up questions work)
  isError?: boolean;
};

const STORAGE_KEY = "penny.athenaChat";
const MAX_SAVED = 40; // keep the saved chat small

function loadSaved(): AthenaMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AthenaMessage[]) : [];
  } catch {
    return []; // storage blocked or broken data: start empty
  }
}

export function useAthenaChat() {
  const [messages, setMessages] = useState<AthenaMessage[]>(loadSaved);
  const [thinking, setThinking] = useState(false);

  // Save the chat on this device whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED)));
    } catch {
      // storage blocked: the chat still works, it just won't survive a refresh
    }
  }, [messages]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;

    // Earlier messages (without errors) go along, so follow-up questions make sense
    const history = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, text: m.text, sql: m.sql ?? null }));

    setMessages((prev) => [...prev, { role: "user", text }]);
    setThinking(true);

    try {
      const res = await fetch("/api/athena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMessages((prev) => [
        ...prev,
        { role: "athena", text: data.answer, sql: data.sql },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "athena", text: err instanceof Error ? err.message : "Something went wrong", isError: true },
      ]);
    } finally {
      setThinking(false);
    }
  }

  // "New chat": end the conversation
  function newChat() {
    if (!thinking) setMessages([]);
  }

  return { messages, thinking, ask, newChat };
}

export type AthenaChat = ReturnType<typeof useAthenaChat>;
