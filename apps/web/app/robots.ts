import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tour.you";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/calendar/",
        "/login",
        "/manager/",
        "/materials/",
        "/new",
        "/profile/",
        "/rubrics/",
        "/sessions/",
      ],
    },
    host: new URL(siteUrl).origin,
  };
}
