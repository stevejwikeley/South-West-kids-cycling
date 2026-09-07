"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, Send } from "lucide-react";
import { askChatbot, type ChatMessage } from "@/lib/actions/chat";
import { WHATSAPP_LINK } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/analytics";

const HIDDEN_PREFIXES = ["/admin", "/organiser", "/login", "/auth", "/oauth"];

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! Ask me anything about the calendar — disciplines, subscribing, clubs, a first race, or a specific event. If I can't help, I'll point you to WhatsApp.",
};

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p)) || pathname === "/embed" || !!pathname?.startsWith("/embed/");

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pending]);

  if (hidden) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || pending) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setPending(true);
    trackEvent("chat_message_sent");

    const result = await askChatbot(next);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.reply) {
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply! }]);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); trackEvent("chat_opened"); }}
        aria-label="Ask a question"
        className="mono"
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#111111",
          color: "#FAFAF8",
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
          boxShadow: "0 8px 28px rgba(17,17,17,0.22)",
        }}
      >
        <HelpCircle size={16} /> ASK A QUESTION
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 1000,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        height: 460,
        maxHeight: "calc(100vh - 40px)",
        background: "#FAFAF8",
        border: "1px solid #E4E2DD",
        boxShadow: "0 8px 28px rgba(17,17,17,0.14)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E4E2DD" }}>
        <span className="mono" style={{ fontSize: 10.5, color: "#6B6B66", letterSpacing: "0.03em" }}>ASK A QUESTION</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          style={{ background: "none", border: "none", color: "#6B6B66", cursor: "pointer", lineHeight: 1, padding: 4, display: "flex" }}
        >
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              background: m.role === "user" ? "#111111" : "#FFFFFF",
              color: m.role === "user" ? "#FAFAF8" : "#111111",
              border: m.role === "user" ? "none" : "1px solid #E4E2DD",
              padding: "8px 12px",
              fontSize: 13.5,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div style={{ alignSelf: "flex-start", color: "#6B6B66", fontSize: 13, padding: "8px 12px" }}>Thinking…</div>
        )}
        {error && (
          <div style={{ alignSelf: "flex-start", maxWidth: "88%", background: "#FBEAE7", border: "1px solid #E0B4A9", color: "#A13A2A", padding: "8px 12px", fontSize: 13, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 16px", borderTop: "1px solid #E4E2DD" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type your question…"
            disabled={pending}
            style={{
              flex: 1,
              background: "#FFFFFF",
              border: "1px solid #D8D6D0",
              color: "#111111",
              padding: "8px 10px",
              fontSize: 13,
              fontFamily: "var(--font-inter), sans-serif",
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || !input.trim()}
            aria-label="Send"
            style={{
              background: "#E0102A",
              color: "#FAFAF8",
              border: "none",
              padding: "0 14px",
              cursor: pending || !input.trim() ? "default" : "pointer",
              opacity: pending || !input.trim() ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent("chat_whatsapp_click")}
          style={{ display: "block", marginTop: 10, fontSize: 11.5, color: "#6B6B66", textAlign: "center" }}
        >
          Prefer a real person? <span style={{ color: "#111111", fontWeight: 700, borderBottom: "1px solid #111111" }}>Message us on WhatsApp →</span>
        </a>
      </div>
    </div>
  );
}
