import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["neo4j-driver", "@daytonaio/sdk", "@composio/core"],
};

export default nextConfig;
