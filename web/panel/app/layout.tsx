import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ICON_VERSION = "4";

export const metadata: Metadata = {
  title: "EyedBot Panel",
  description: "Panel de administración de EyedBot",
  icons: {
    icon: [
      { url: `/eyedbot-icon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
      { url: `/eyedbot-icon-32.png?v=${ICON_VERSION}`, type: "image/png", sizes: "32x32" },
      { url: `/eyedbot-icon.png?v=${ICON_VERSION}`, type: "image/png", sizes: "512x512" },
      { url: `/favicon.ico?v=${ICON_VERSION}`, sizes: "48x48" },
    ],
    apple: [{ url: `/eyedbot-icon.png?v=${ICON_VERSION}`, type: "image/png", sizes: "512x512" }],
    shortcut: `/eyedbot-icon-32.png?v=${ICON_VERSION}`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
