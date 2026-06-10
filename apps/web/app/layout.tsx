import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tour.video",
  description: "AI-powered mystery shopping coaching for sales agents."
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
