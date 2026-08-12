"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface SubscribeEmailState {
  error?: string;
  success?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Runs through the service-role client rather than the RLS-guarded anon
// client: an upsert on conflict(email) both handles a brand-new signup and
// a resubscribe (clearing unsubscribed_at) in one call, which would
// otherwise need an RLS update policy just for this one path.
export async function subscribeEmail(_prevState: SubscribeEmailState, formData: FormData): Promise<SubscribeEmailState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "That doesn't look like a valid email address." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_subscribers")
    .upsert({ email, unsubscribed_at: null }, { onConflict: "email" });

  if (error) {
    return { error: "Couldn't save that — please try again in a moment." };
  }

  return { success: true };
}

export interface UnsubscribeState {
  error?: string;
  success?: boolean;
}

export async function unsubscribeByToken(token: string): Promise<UnsubscribeState> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "That unsubscribe link isn't valid — it may have already been used." };
  }

  return { success: true };
}
