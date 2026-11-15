// Ask Athena: a chat where you ask questions about your spending.
// Styling is intentionally simple (classes start with "athena-") so it can be restyled freely.

import { useEffect, useRef, useState } from "react";
import owlIcon from "./assets/owl.png";
import type { AthenaChat } from "./useAthenaChat";

// The conversation itself lives in App (see useAthenaChat), so it isn't lost when you switch pages
export default function AthenaPage({ chat }: { chat: AthenaChat }) {
  const { messages, thinking, ask, newChat } = chat;
  const [question, setQuestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the conversation changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // stop the form from reloading the page
    if (!question.trim() || thinking) return;
    ask(question);
    setQuestion("");
  }

  return (
    <div className="athena">
      {/* the page title comes from App; this row is just the intro + "New chat" */}
      <header className="athena-header">
        <img src={owlIcon} alt="" className="athena-owl" />
        <p className="muted">Ask anything about your spending, in plain English.</p>
        {messages.length > 0 && (
          <button className="button button-secondary athena-new-chat" onClick={newChat} disabled={thinking}>
            New chat
          </button>
        )}
      </header>

      <div className="athena-messages">
        {messages.map((m, i) => (
          <div key={i} className={`athena-message ${m.role} ${m.isError ? "error" : ""}`}>
            <p>{m.text}</p>
          </div>
        ))}

        {thinking && <div className="athena-message athena thinking">Athena is thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <form className="athena-form" onSubmit={handleSubmit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How much did I spend on dining last month?"
          maxLength={500}
          aria-label="Your question"
        />
        <button className="button" type="submit" disabled={thinking || !question.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
