import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { buildPendingDigestHtml } from "@/lib/email/pending-digest";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_NOTIFICATION_EMAIL not configured." }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("events_pending")
    .select("*", { count: "exact", head: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!count) {
    return NextResponse.json({ sent: false, pending: 0 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";
  const pendingUrl = `${siteUrl}/admin/pending`;

  try {
    await sendEmail({
      to: adminEmail,
      subject: `${count} event${count === 1 ? "" : "s"} waiting in the pending queue`,
      html: buildPendingDigestHtml(count, pendingUrl),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send email." }, { status: 500 });
  }

  return NextResponse.json({ sent: true, pending: count });
}
