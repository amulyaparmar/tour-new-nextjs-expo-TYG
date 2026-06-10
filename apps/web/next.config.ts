import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
  transpilePackages: ["@tour/shared"],
  turbopack: {
    root: path.join(__dirname, "..", "..")
  }
};

export default nextConfig;
