import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import FeedbackPopup from "@/components/FeedbackPopup";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { getCurrentProfile } from "@/lib/auth";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  weight: ["700", "900"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const description = "One calendar for all youth cycling races and events across Devon, Cornwall & Somerset — XC, cyclocross, road, triathlon and club sessions for ages 5–16.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.southwestkidscycling.uk"),
  title: {
    default: "South West Kids Cycling",
    template: "%s — South West Kids Cycling",
  },
  description,
  openGraph: {
    title: "South West Kids Cycling",
    description,
    url: "/",
    siteName: "South West Kids Cycling",
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "South West Kids Cycling",
    description,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body style={{ fontFamily: "var(--font-inter), sans-serif" }}>
        <GoogleAnalytics />
        <TopNav role={profile?.role} />
        {children}
        <Footer />
        <FeedbackPopup />
      </body>
    </html>
  );
}
