import { BottomNav } from "../BottomNav";

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">
          <span className="brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
              <polygon points="9,6 9,18 19,12" />
            </svg>
          </span>
          <span className="brand-name">Tour.video</span>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <BottomNav />
    </div>
  );
}
