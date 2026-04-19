import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["cabinet.autoprio.dev"],
  serverExternalPackages: ["agentmail", "@octokit/app", "@octokit/rest"],
};

export default nextConfig;
