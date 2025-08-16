import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // allow deployment even if ESLint finds problems
    ignoreDuringBuilds: true,
  },
  typescript: {
    // allow deployment even if TypeScript has type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
