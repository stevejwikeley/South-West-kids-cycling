"use server";

import { sendEmail } from "@/lib/email/resend";
import { buildContactEmailHtml } from "@/lib/email/contact";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

const REASONS = new Set(["general", "organiser"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContactForm(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const reason = String(formData.get("reason") ?? "general");
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Please fill in your name, email, and message." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "That doesn't look like a valid email address." };
  }
  if (!REASONS.has(reason)) {
    return { error: "Invalid reason." };
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    return { error: "Contact form isn't configured yet — please try again later." };
  }

  const reasonLabel = reason === "organiser" ? "Request organiser account" : "General enquiry";

  try {
    await sendEmail({
      to: adminEmail,
      subject: `${reasonLabel} — ${name}`,
      html: buildContactEmailHtml({ name, email, reason, message }),
    });
  } catch {
    return { error: "Couldn't send your message — please try again in a moment." };
  }

  return { success: true };
}
