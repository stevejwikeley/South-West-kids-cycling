"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, ChevronDown } from "lucide-react";
import { submitFeedback, type FeedbackFormState } from "@/lib/actions/feedback";
import { trackEvent } from "@/lib/analytics";

// DONE_KEY persists across sessions (localStorage) — once someone submits,
// we never ask again. VISIT_COUNT_KEY also persists, incremented once per
// browser session (guarded by the sessionStorage flag) so we can trigger on
// a second visit even if it happens well within the 2-minute delay.
const DONE_KEY = "swkc_feedback_done";
const VISIT_COUNT_KEY = "swkc_visit_count";
const SESSION_COUNTED_KEY = "swkc_session_counted";
const SHOW_DELAY_MS = 2 * 60 * 1000;
const HIDDEN_PREFIXES = ["/admin", "/organiser", "/login", "/auth", "/oauth", "/embed"];

type Stage = "hidden" | "collapsed" | "expanded";

const pillBase: React.CSSProperties = {
  border: "1px solid #D8D6D0",
  background: "#FFFFFF",
  color: "#111111",
  fontSize: 12.5,
  padding: "7px 12px",
  cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
};

function pillStyle(selected: boolean): React.CSSProperties {
  return selected
    ? { ...pillBase, background: "#111111", color: "#FAFAF8", borderColor: "#111111" }
    : pillBase;
}

const questionLabel: React.CSSProperties = {
  fontSize: 10.5,
  color: "#6B6B66",
  display: "block",
  marginBottom: 8,
  letterSpacing: "0.03em",
};

export default function FeedbackPopup() {
  const pathname = usePathname();
  const [stage, setStage] = useState<Stage>("hidden");
  const [racedBefore, setRacedBefore] = useState<"yes" | "no" | null>(null);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [willSubscribe, setWillSubscribe] = useState<"yes" | "no" | "already" | null>(null);
  const [state, formAction, pending] = useActionState<FeedbackFormState, FormData>(submitFeedback, {});

  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DONE_KEY)) return;

    if (!window.sessionStorage.getItem(SESSION_COUNTED_KEY)) {
      window.sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
      const nextCount = Number(window.localStorage.getItem(VISIT_COUNT_KEY) ?? "0") + 1;
      window.localStorage.setItem(VISIT_COUNT_KEY, String(nextCount));
    }
    const visitCount = Number(window.localStorage.getItem(VISIT_COUNT_KEY) ?? "1");
    const isSecondVisit = visitCount >= 2;

    const timer = setTimeout(() => {
      setStage("collapsed");
      trackEvent("feedback_bubble_shown", { trigger: isSecondVisit ? "second_visit" : "time_delay" });
    }, isSecondVisit ? 0 : SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hidden]);

  useEffect(() => {
    if (state.success) {
      window.localStorage.setItem(DONE_KEY, "1");
      trackEvent("feedback_submit", { raced_before: racedBefore, usefulness, will_subscribe: willSubscribe });
      const timer = setTimeout(() => setStage("hidden"), 2500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  if (hidden || stage === "hidden") return null;

  if (stage === "collapsed") {
    return (
      <button
        type="button"
        onClick={() => { setStage("expanded"); trackEvent("feedback_bubble_expand"); }}
        aria-label="Open feedback form"
        className="mono"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
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
        <MessageCircle size={16} /> FEEDBACK
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 1000,
        width: 320,
        maxWidth: "calc(100vw - 32px)",
        background: "#FAFAF8",
        border: "1px solid #E4E2DD",
        boxShadow: "0 8px 28px rgba(17,17,17,0.14)",
        padding: "20px 20px 18px",
      }}
    >
      <button
        type="button"
        onClick={() => setStage("collapsed")}
        aria-label="Collapse feedback"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "none",
          border: "none",
          color: "#6B6B66",
          cursor: "pointer",
          lineHeight: 1,
          padding: 4,
          display: "flex",
        }}
      >
        <ChevronDown size={18} />
      </button>

      {state.success ? (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4A4A46", margin: 0 }}>
          Thanks for the feedback — really appreciate it.
        </p>
      ) : (
        <form action={formAction}>
          <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginBottom: 4 }}>QUICK FEEDBACK</div>
          <p style={{ fontSize: 13, color: "#4A4A46", margin: "0 0 16px", lineHeight: 1.5 }}>
            Got a moment? A couple of questions would really help.
          </p>

          <input type="hidden" name="raced_before" value={racedBefore ?? ""} />
          <input type="hidden" name="usefulness" value={usefulness ?? ""} />
          <input type="hidden" name="will_subscribe" value={willSubscribe ?? ""} />
          <input type="hidden" name="page_url" value={pathname ?? ""} />

          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={questionLabel}>HAVE YOU RACED BEFORE?</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={pillStyle(racedBefore === "yes")} onClick={() => setRacedBefore("yes")}>Yes</button>
              <button type="button" style={pillStyle(racedBefore === "no")} onClick={() => setRacedBefore("no")}>No</button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={questionLabel}>HOW USEFUL IS THIS SITE FOR YOU?</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  style={{ ...pillStyle(usefulness === n), width: 32, padding: "7px 0", textAlign: "center" }}
                  onClick={() => setUsefulness(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "#6B6B66" }}>Not very</span>
              <span style={{ fontSize: 10, color: "#6B6B66" }}>Very</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={questionLabel}>WILL YOU SUBSCRIBE?</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={pillStyle(willSubscribe === "yes")} onClick={() => setWillSubscribe("yes")}>Yes</button>
              <button type="button" style={pillStyle(willSubscribe === "no")} onClick={() => setWillSubscribe("no")}>No</button>
              <button type="button" style={pillStyle(willSubscribe === "already")} onClick={() => setWillSubscribe("already")}>Already do</button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={questionLabel}>ANY OTHER FEEDBACK?</label>
            <textarea
              name="message"
              placeholder="Optional"
              style={{
                width: "100%",
                background: "#FFFFFF",
                border: "1px solid #D8D6D0",
                color: "#111111",
                padding: "8px 10px",
                fontSize: 13,
                minHeight: 60,
                resize: "vertical",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            style={{
              background: "#E0102A",
              color: "#FAFAF8",
              border: "none",
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
              width: "100%",
            }}
          >
            {pending ? "Sending…" : "Send feedback"}
          </button>

          {state.error && <p style={{ color: "#A13A2A", fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>{state.error}</p>}
        </form>
      )}
    </div>
  );
}
