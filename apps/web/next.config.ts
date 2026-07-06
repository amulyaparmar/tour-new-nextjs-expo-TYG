import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tour recordings can exceed the default 10MB proxy buffer (see proxy.ts on /api/*).
    proxyClientMaxBodySize: "50mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "imagedelivery.net"
      },
      {
        protocol: "https",
        hostname: "tkweddqlriikqgylsuxz.supabase.co"
      },
      {
        protocol: "https",
        hostname: "static.tour.video"
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com"
      }
    ]
  },
  transpilePackages: ["@tour/shared"]
};

export default withWorkflow(nextConfig);
