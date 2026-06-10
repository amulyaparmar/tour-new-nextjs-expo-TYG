"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function DetailTabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  return (
    <>
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.find((t) => t.id === activeTab)?.content}
    </>
  );
}
