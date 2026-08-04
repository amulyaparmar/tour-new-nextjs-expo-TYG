import type { Metadata } from "next";

import { TourLogin } from "./TourLogin";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Tour workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return <TourLogin />;
}
