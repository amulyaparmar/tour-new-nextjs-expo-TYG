import type { Metadata } from "next";

import { TourLogin } from "./TourLogin";

export const metadata: Metadata = {
  title: "Sign in | Tour",
};

export default function LoginPage() {
  return <TourLogin />;
}
