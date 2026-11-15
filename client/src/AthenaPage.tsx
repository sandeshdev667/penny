// Ask Athena: a chat (like a normal AI chatbot) where you ask questions about your spending.

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { EASE } from "./anim";
import { MicIcon, PlusIcon, SendIcon, SpeakerIcon } from "./icons";
import { useAthenaVoice } from "./useAthenaVoice";
import { useLang } from "./lang";
import athenaMark from "./assets/athena-mark.svg";
import type { AthenaChat } from "./useAthenaChat";

// Starter questions shown on an empty chat (click one to ask it)
const SUGGESTIONS = [
  { title: "Dining last month", question: "How much did I spend on dining last month?" },
  { title: "My biggest month", question: "Which month did I spend the most, and on what?" },
  { title: "Subscriptions", question: "How much do my subscriptions cost each month?" },
  { title: "Where I shop most", question: "Which stores do I spend the most at?" },
];

const bubble = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE },
};

// Athena's portrait; it glows and ripples while she is speaking
function AthenaAvatar({ speaking = false }: { speaking?: boolean }) {
  return <img src={athenaMark} alt="" className={`chat-avatar ${speaking ? "is-speaking" : ""}`} aria-hidden />;
}

// The conversation itself lives in App (see useAthenaChat), so it isn't lost when you switch pages
export default function AthenaPage({ chat }: { chat: AthenaChat }) {
  const { messages, thinking, ask, newChat } = chat;
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const empty = messages.length === 0;
  const voice = useAthenaVoice();
  const { t } = useLang();

  // She speaks each NEW answer aloud (answers already in the chat when you open the page stay silent)
  const seen = useRef(messages.length);
  useEffect(() => {
    if (messages.length <= seen.current) {
      seen.current = messages.length;
      return;
    }
    seen.current = messages.length;
    const last = messages[messages.length - 1];
    if (voice.autoSpeak && last.role === "athena" && !last.isError) voice.speak(last.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Scroll to the newest message whenever the conversation changes
  useEffect(() => {
    if (!empty) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, empty]);

  // The message box grows with what you type (up to a limit)
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`;
  }, [question]);

  function send(text: string) {
    if (!text.trim() || thinking) return;
    ask(text);
    setQuestion("");
    inputRef.current?.focus();
  }

  // Enter sends, Shift+Enter makes a new line
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(question);
    }
  }

  return (
    <div className="chat">
      {/* ---------- Slim top bar ---------- */}
      <header className="chat-top">
        <div className="chat-title">
          <AthenaAvatar />
          <span>Athena</span>
          <span className="chat-subtitle">{t("askSubtitle")}</span>
        </div>
        <div className="chat-top-actions">
          <button
            className={`chat-new ${voice.autoSpeak ? "is-on" : ""}`}
            onClick={() => {
              if (voice.autoSpeak) voice.stop();
              voice.setAutoSpeak(!voice.autoSpeak);
            }}
            title="Athena speaks her answers aloud"
            aria-pressed={voice.autoSpeak}
          >
            <SpeakerIcon size={16} muted={!voice.autoSpeak} />
            Voice {voice.autoSpeak ? "on" : "off"}
          </button>
          {!empty && (
            <button className="chat-new" onClick={newChat} disabled={thinking}>
              <PlusIcon size={16} />
              New chat
            </button>
          )}
        </div>
      </header>

      {voice.error && <p className="chat-voice-error">{voice.error}</p>}

      {empty ? (
        /* ---------- Empty chat: greeting + suggestions ---------- */
        <motion.div
          className="chat-welcome"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <img src={athenaMark} alt="" className="chat-welcome-mark" />
          <h1>{t("askTitle")}</h1>
          <p className="muted">{t("askSub")}</p>
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={s.title}
                onClick={() => send(s.question)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: EASE }}
              >
                <strong>{s.title}</strong>
                <span>{s.question}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      ) : (
        /* ---------- The conversation ---------- */
        <div className="chat-log">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <motion.div key={i} className="msg msg-user" {...bubble}>
                <p>{m.text}</p>
              </motion.div>
            ) : (
              <motion.div key={i} className={`msg msg-athena ${m.isError ? "msg-error" : ""}`} {...bubble}>
                <AthenaAvatar speaking={voice.speaking === m.text} />
                <div className="msg-body">
                  <span className="msg-name">
                    Athena
                    {!m.isError && (
                      <button
                        className="msg-hear"
                        onClick={() => (voice.speaking === m.text ? voice.stop() : voice.speak(m.text))}
                        aria-label={voice.speaking === m.text ? "Stop" : "Hear Athena"}
                        title={voice.speaking === m.text ? "Stop" : "Hear Athena"}
                      >
                        <SpeakerIcon size={14} />
                        {voice.speaking === m.text ? "Stop" : "Hear"}
                      </button>
                    )}
                  </span>
                  <p>{m.text}</p>
                </div>
              </motion.div>
            ),
          )}

          {thinking && (
            <motion.div className="msg msg-athena" {...bubble}>
              <AthenaAvatar />
              <div className="msg-body">
                <span className="msg-name">Athena</span>
                <span className="typing" aria-label="Athena is thinking">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ---------- Message box ---------- */}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault(); // stop the form from reloading the page
          send(question);
        }}
      >
        <div className="composer-box">
          <textarea
            ref={inputRef}
            rows={1}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("askPlaceholder")}
            maxLength={500}
            aria-label="Your question"
          />
          {voice.supportsMic && (
            <button
              className={`composer-mic ${voice.listening ? "is-listening" : ""}`}
              type="button"
              onClick={() => voice.listen((text) => send(text))}
              aria-label={voice.listening ? "Stop listening" : "Speak your question"}
              title={voice.listening ? "Listening… click to stop" : "Speak your question"}
              disabled={thinking}
            >
              <MicIcon size={18} />
            </button>
          )}
          <button className="composer-send" type="submit" disabled={thinking || !question.trim()} aria-label="Send">
            <SendIcon size={18} />
          </button>
        </div>
        <p className="composer-note">{t("askNote")}</p>
      </form>
    </div>
  );
}
