import type { Metadata, Viewport } from "next";
import "./base.css";

const productName = "Tour";
const productTitle = "Tour | AI Mystery Shopping for Leasing Teams";
const productDescription =
  "Tour is the AI mystery shopping and coaching platform for multifamily leasing teams to record property tours, evaluate leasing conversations, coach agents, and improve follow-up.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tour.you";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: productTitle,
    template: "%s | Tour",
  },
  description: productDescription,
  applicationName: productName,
  keywords: [
    "AI mystery shopping",
    "multifamily mystery shopping",
    "multifamily leasing software",
    "leasing agent coaching",
    "AI sales coaching",
    "conversation intelligence",
    "prospect follow-up",
  ],
  authors: [{ name: productName, url: siteUrl }],
  creator: productName,
  publisher: productName,
  category: "technology",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: productName,
    title: productTitle,
    description: productDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: productTitle,
    description: productDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#4D8AE5",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
