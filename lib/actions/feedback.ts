"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { buildFeedbackEmailHtml, buildFeedbackSubject } from "@/lib/email/feedback";
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

  const email = String(formData.get("email") ?? "").trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That doesn't look like a valid email address." };
  }

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
    email,
  });

  if (error) {
    return { error: "Couldn't send your feedback — please try again in a moment." };
  }

  // Notify the admin. Deliberately non-fatal, unlike the contact form: the
  // feedback row is already safely stored by this point, so a Resend outage
  // must not turn a saved submission into an error the visitor would retry —
  // that would only duplicate the row. Same reasoning for a missing
  // ADMIN_NOTIFICATION_EMAIL, which is skipped silently.
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    const fields = {
      racedBefore,
      usefulness,
      willSubscribe,
      message,
      pageUrl,
      email,
    };
    try {
      await sendEmail({
        to: adminEmail,
        subject: buildFeedbackSubject(fields),
        html: buildFeedbackEmailHtml(fields),
      });
    } catch (err) {
      console.error("Failed to send feedback notification email:", err);
    }
  }

  return { success: true };
}
