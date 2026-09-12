import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@daytonaio/sdk", "neo4j-driver", "@composio/core"],
};

export default nextConfig;
