import os from "node:os";
import path from "node:path";

import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

/** Hosts that can load Next.js `/_next/*` assets during `next dev` (LAN phones, etc.). */
function resolveAllowedDevOrigins() {
  const fromEnv = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const lanHosts = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry): entry is os.NetworkInterfaceInfo => Boolean(entry))
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
  return Array.from(new Set(["127.0.0.1", "localhost", ...lanHosts, ...fromEnv]));
}

const nextConfig: NextConfig = {
  // Phone / LAN testing (e.g. http://192.168.x.x:3000) must be allowlisted so
  // Next.js serves /_next dev assets. Without this, React never hydrates and
  // buttons/forms appear dead (native GET submit only).
  allowedDevOrigins: resolveAllowedDevOrigins(),
  experimental: {
    // Tour recordings can exceed the default 10MB proxy buffer (see proxy.ts on /api/*).
    proxyClientMaxBodySize: "50mb",
  },
  // PDFKit reads its built-in font metrics from `js/data` at runtime. Keep it
  // external so `__dirname` still points at the package, and explicitly trace
  // the non-JavaScript assets into the session-export server function.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/api/sessions/*/export": ["../../node_modules/pdfkit/js/data/**/*"],
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
