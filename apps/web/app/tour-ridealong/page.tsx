import type { Metadata } from "next";

import { TourRidealongClient } from "./TourRidealongClient";

export const metadata: Metadata = {
  title: "Tour Ridealong | Conversation Evaluation Demo",
  description: "Review a recorded in-person conversation with transcript highlights, AI coaching, rubric scoring, and speaker tracks.",
  openGraph: {
    title: "Tour Ridealong",
    description: "AI review for recorded tour and sales conversations.",
    type: "website",
  },
};

export default function TourRidealongPage() {
  return <TourRidealongClient />;
}
