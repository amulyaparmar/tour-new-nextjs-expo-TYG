import { requireTourWorkspace } from "@/lib/tour-auth";
import { BottomNav } from "../BottomNav";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
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
        <WorkspaceSwitcher
          user={workspace.user}
          currentCommunity={{
            id: workspace.community.id,
            name: workspace.community.name,
            alias: workspace.community.alias,
          }}
          communities={workspace.communities.map((community) => ({
            id: community.id,
            name: community.name,
            alias: community.alias,
          }))}
        />
      </header>
      <main className="main-content">{children}</main>
      <BottomNav />
    </div>
  );
}
