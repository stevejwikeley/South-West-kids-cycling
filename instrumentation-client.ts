import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Cheap at this traffic level; dial back first if visitor volume grows —
  // unlike the server-side rate, this scales with page views, not with
  // fixed-schedule jobs like the ingestion cron.
  tracesSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
