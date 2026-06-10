import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tour Dashboard",
  description: "Manage tour knowledge, sales materials, media, and recordings."
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
