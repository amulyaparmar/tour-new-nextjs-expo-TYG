import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tour | AI Mystery Shopping for Leasing Teams",
    short_name: "Tour",
    description:
      "Record property tours, evaluate leasing conversations, coach agents, and improve follow-up with AI mystery shopping.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4D8AE5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
