import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen Next.js dev indicator (the bottom-left badge). It is a
  // dev-only overlay and never appears in production, but this removes it from
  // local dev too. Build and runtime errors are still surfaced.
  devIndicators: false,
};

export default nextConfig;
