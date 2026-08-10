import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import TopNav from "@/components/TopNav";
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

export const metadata: Metadata = {
  title: "South West Kids Cycling",
  description: "One calendar for all youth cycling races and events across Devon & Cornwall.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body style={{ fontFamily: "var(--font-inter), sans-serif" }}>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
