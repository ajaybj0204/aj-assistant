import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files and images travel as base64 in requests.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
