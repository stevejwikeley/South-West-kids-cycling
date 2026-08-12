"use server";

import { createClient } from "@/lib/supabase/server";
import type { WillSubscribeType } from "@/lib/supabase/types";

export interface FeedbackFormState {
  error?: string;
  success?: boolean;
}

const SUBSCRIBE_VALUES = new Set<string>(["yes", "no", "already"]);

export async function submitFeedback(_prevState: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const racedBeforeRaw = formData.get("raced_before");
  const racedBefore = racedBeforeRaw === "yes" ? true : racedBeforeRaw === "no" ? false : null;

  const usefulnessRaw = formData.get("usefulness");
  const usefulness = usefulnessRaw ? Number(usefulnessRaw) : null;
  if (usefulness !== null && (!Number.isInteger(usefulness) || usefulness < 1 || usefulness > 5)) {
    return { error: "Invalid usefulness rating." };
  }

  const willSubscribeRaw = String(formData.get("will_subscribe") ?? "");
  const willSubscribe: WillSubscribeType | null = SUBSCRIBE_VALUES.has(willSubscribeRaw)
    ? (willSubscribeRaw as WillSubscribeType)
    : null;

  const message = String(formData.get("message") ?? "").trim() || null;
  const pageUrl = String(formData.get("page_url") ?? "").trim() || null;

  if (racedBefore === null && usefulness === null && willSubscribe === null && !message) {
    return { error: "Answer at least one question first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_feedback").insert({
    raced_before: racedBefore,
    usefulness,
    will_subscribe: willSubscribe,
    message,
    page_url: pageUrl,
  });

  if (error) {
    return { error: "Couldn't send your feedback — please try again in a moment." };
  }

  return { success: true };
}
