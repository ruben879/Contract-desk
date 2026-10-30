import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
