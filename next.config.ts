import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The TypeScript compiler is used at runtime as a parser; keep it out of the server bundle.
  serverExternalPackages: ["typescript", "pg"],
  outputFileTracingIncludes: { "/api/**": ["./samples/**/*"] },
};

export default nextConfig;
