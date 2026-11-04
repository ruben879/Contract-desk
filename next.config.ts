import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // The official TREC PDFs are read from disk at render time; ship them with the server code.
  outputFileTracingIncludes: { "/**": ["./forms/trec/*.pdf"] },
};

export default nextConfig;
