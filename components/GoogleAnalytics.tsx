import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-34YMSCL7DR";

export default function GoogleAnalytics() {
  // Production deploys only. Local dev, Playwright runs and Vercel previews
  // all used to report here, and every fresh test browser counted as a new
  // "Direct" user — that's what inflated September to ~3,000 users.
  if (process.env.VERCEL_ENV !== "production") return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
