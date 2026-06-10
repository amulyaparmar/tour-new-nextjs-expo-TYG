import type { Metadata } from "next";

import { TourRidealongClient } from "../tour-ridealong/TourRidealongClient";

export const metadata: Metadata = {
  title: "Tour Record | Ridealong Recording Demo",
  description: "Preview one-click tour recording, AI review, role play, and mystery shopping workflows.",
  openGraph: {
    title: "Tour Record",
    description: "Record and review leasing tour conversations with AI coaching.",
    type: "website",
  },
};

export default function TourRecordPage() {
  return <TourRidealongClient />;
}
