export type IntegrationName = "daytona" | "neo4j" | "llm" | "composio";

export type IntegrationMode = "live" | "mock";

export interface IntegrationStatus {
  name: IntegrationName;
  label: string;
  mode: IntegrationMode;
  detail: string;
}

const has = (key: string) => Boolean(process.env[key]?.trim());

export const env = {
  daytona: {
    apiKey: process.env.DAYTONA_API_KEY,
    target: process.env.DAYTONA_TARGET ?? "us",
    live: () => has("DAYTONA_API_KEY"),
  },
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME ?? "neo4j",
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE ?? "neo4j",
    live: () => has("NEO4J_URI") && has("NEO4J_PASSWORD"),
  },
  nosana: {
    endpoint: process.env.NOSANA_ENDPOINT,
    apiKey: process.env.NOSANA_API_KEY,
    // Matches --served-model-name of the deepseek-r1-qwen-1-5b Nosana template (vLLM, port 9000).
    model: process.env.NOSANA_MODEL ?? "DeepSeek-R1-Distill-Qwen-1.5B",
    live: () => has("NOSANA_ENDPOINT"),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    live: () => has("OPENAI_API_KEY"),
  },
  composio: {
    apiKey: process.env.COMPOSIO_API_KEY,
    live: () => has("COMPOSIO_API_KEY"),
  },
};

export function llmProvider(): "nosana" | "openai" | "mock" {
  if (env.nosana.live()) return "nosana";
  if (env.openai.live()) return "openai";
  return "mock";
}

export function integrationStatuses(): IntegrationStatus[] {
  const provider = llmProvider();
  return [
    {
      name: "daytona",
      label: "Daytona sandboxes",
      mode: env.daytona.live() ? "live" : "mock",
      detail: env.daytona.live()
        ? `@daytonaio/sdk, target ${env.daytona.target}`
        : "Set DAYTONA_API_KEY to run code in real sandboxes",
    },
    {
      name: "neo4j",
      label: "Neo4j Aura",
      mode: env.neo4j.live() ? "live" : "mock",
      detail: env.neo4j.live()
        ? `neo4j-driver → ${env.neo4j.uri}`
        : "Set NEO4J_URI + NEO4J_PASSWORD; using in-memory graph",
    },
    {
      name: "llm",
      label: "LLM inference",
      mode: provider === "mock" ? "mock" : "live",
      detail:
        provider === "nosana"
          ? `Nosana endpoint, model ${env.nosana.model}`
          : provider === "openai"
            ? `OpenAI fallback, model ${env.openai.model}`
            : "Set NOSANA_ENDPOINT (or OPENAI_API_KEY); deterministic mock replies",
    },
    {
      name: "composio",
      label: "Composio tools",
      mode: env.composio.live() ? "live" : "mock",
      detail: env.composio.live()
        ? "@composio/core client configured"
        : "Set COMPOSIO_API_KEY to enable tool calling",
    },
  ];
}
