import "server-only";
import { Composio } from "@composio/core";
import { env } from "./env";

let client: Composio | null = null;

/** Composio client, or null when COMPOSIO_API_KEY is not set. */
export function getComposio(): Composio | null {
  if (!env.composio.live()) return null;
  if (!client) client = new Composio({ apiKey: env.composio.apiKey });
  return client;
}

export interface ToolSummary {
  slug: string;
  name: string;
  description?: string;
}

/**
 * List tools available for a toolkit (e.g. "github", "slack") for a given user id.
 * Returns a static mock list when no key is configured.
 */
export async function listTools(userId: string, toolkit: string): Promise<{ tools: ToolSummary[]; mode: "live" | "mock" }> {
  const composio = getComposio();
  if (!composio) {
    return {
      mode: "mock",
      tools: [
        { slug: `${toolkit.toUpperCase()}_MOCK_ACTION`, name: `Mock ${toolkit} action`, description: "Set COMPOSIO_API_KEY to load real tools" },
      ],
    };
  }
  // OpenAI-style function tool definitions; shape is provider-agnostic JSON.
  const tools = (await composio.tools.get(userId, { toolkits: [toolkit] })) as unknown as Array<{
    function?: { name?: string; description?: string };
    name?: string;
    description?: string;
  }>;
  return {
    mode: "live",
    tools: tools.map((t) => ({
      slug: t.function?.name ?? t.name ?? "unknown",
      name: t.function?.name ?? t.name ?? "unknown",
      description: t.function?.description ?? t.description,
    })),
  };
}
