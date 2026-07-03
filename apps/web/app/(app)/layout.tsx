import Link from "next/link";
import { requireTourWorkspace } from "@/lib/tour-auth";
import { BottomNav } from "../BottomNav";
import "../globals.css";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const workspace = await requireTourWorkspace();

  return (
    <div className="app-shell">
      <header className="top-bar">
        <img src="/images/tour logo TYG dark.svg" alt="Tour" height="28" style={{ height: 28, width: "auto" }} />
        <span className="top-bar-community">{workspace.community.name}</span>
        <Link href="/profile" className="top-bar-avatar" aria-label="Profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </Link>
      </header>
      <main className="main-content">{children}</main>
      <BottomNav />
    </div>
  );
}
