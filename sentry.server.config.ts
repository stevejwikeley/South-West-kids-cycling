import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Traffic on this site is low enough that 100% server-side tracing won't
  // approach Sentry's free-tier quota, and it means low-frequency operations
  // like the nightly ingestion cron are never sampled away.
  tracesSampleRate: 1.0,
});
