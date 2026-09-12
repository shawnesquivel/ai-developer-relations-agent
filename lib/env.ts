function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const env = {
  DAYTONA_API_KEY: read("DAYTONA_API_KEY"),
  DAYTONA_TARGET: read("DAYTONA_TARGET") ?? "us",
  NEO4J_URI: read("NEO4J_URI"),
  NEO4J_USERNAME: read("NEO4J_USERNAME") ?? "neo4j",
  NEO4J_PASSWORD: read("NEO4J_PASSWORD"),
  NEO4J_DATABASE: read("NEO4J_DATABASE") ?? "neo4j",
  NOSANA_ENDPOINT: read("NOSANA_ENDPOINT"),
  NOSANA_API_KEY: read("NOSANA_API_KEY"),
  NOSANA_MODEL: read("NOSANA_MODEL") ?? "DeepSeek-R1-Distill-Qwen-1.5B",
  OPENAI_API_KEY: read("OPENAI_API_KEY"),
  OPENAI_MODEL: read("OPENAI_MODEL") ?? "gpt-5.6-sol",
  COMPOSIO_API_KEY: read("COMPOSIO_API_KEY"),
  GITHUB_PAT: read("GITHUB_PAT"),
  COMPOSIO_USER_ID: read("COMPOSIO_USER_ID") ?? "hacksprint-demo",
};

export type IntegrationMode = "live" | "mock";

export type IntegrationStatus = {
  name: string;
  label: string;
  mode: IntegrationMode;
  detail: string;
};

export function llmProvider(): "nosana" | "openai" | "mock" {
  if (env.OPENAI_API_KEY) return "openai";
  if (env.NOSANA_ENDPOINT) return "nosana";
  return "mock";
}

export function neo4jLive(): boolean {
  return Boolean(env.NEO4J_URI && env.NEO4J_PASSWORD);
}

function neo4jHostDetail(): string {
  if (!env.NEO4J_URI) return "In-memory graph (no NEO4J_URI)";
  try {
    const url = new URL(env.NEO4J_URI.replace(/^bolt\+s/, "https").replace(/^bolt/, "http").replace(/^neo4j\+s/, "https").replace(/^neo4j/, "http"));
    return `Connected host ${url.hostname}`;
  } catch {
    return "Configured Neo4j endpoint";
  }
}

function nosanaHostDetail(): string {
  const provider = llmProvider();
  if (provider === "nosana") {
    try {
      const host = new URL(env.NOSANA_ENDPOINT!).hostname;
      return `Nosana vLLM @ ${host}`;
    } catch {
      return "Nosana vLLM endpoint";
    }
  }
  if (provider === "openai") return `OpenAI ${env.OPENAI_MODEL}`;
  return "Deterministic mock author";
}

export function integrationStatuses(): IntegrationStatus[] {
  return [
    {
      name: "daytona",
      label: "Daytona sandboxes",
      mode: env.DAYTONA_API_KEY ? "live" : "mock",
      detail: env.DAYTONA_API_KEY
        ? `@daytonaio/sdk, target ${env.DAYTONA_TARGET}`
        : "No DAYTONA_API_KEY — mock sandbox",
    },
    {
      name: "neo4j",
      label: "Neo4j graph",
      mode: neo4jLive() ? "live" : "mock",
      detail: neo4jLive() ? neo4jHostDetail() : "Process-memory graph",
    },
    {
      name: "llm",
      label: "LLM",
      mode: llmProvider() === "mock" ? "mock" : "live",
      detail: nosanaHostDetail(),
    },
    {
      name: "composio",
      label: "Composio tools",
      mode: env.COMPOSIO_API_KEY ? "live" : "mock",
      detail: env.COMPOSIO_API_KEY
        ? `GitHub toolkit · user ${env.COMPOSIO_USER_ID}`
        : "Static mock tool descriptors",
    },
  ];
}

export function nosanaBaseUrl(): string | undefined {
  if (!env.NOSANA_ENDPOINT) return undefined;
  return env.NOSANA_ENDPOINT.replace(/\/$/, "").replace(/\/v1$/, "") + "/v1";
}
