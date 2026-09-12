import { Composio } from "@composio/core";
import { env } from "./env";
import { TOOLS } from "./seed";

let client: Composio | null = null;

/** @composio/core 0.17: constructor-level versions. "latest" still needs skip on execute. */
export const COMPOSIO_TOOLKIT_VERSIONS = { github: "latest" } as const;

export function createComposio(apiKey: string): Composio {
  return new Composio({
    apiKey,
    toolkitVersions: COMPOSIO_TOOLKIT_VERSIONS,
  });
}

export function getComposio(): Composio {
  if (!env.COMPOSIO_API_KEY) throw new Error("COMPOSIO_API_KEY is not set");
  if (!client) client = createComposio(env.COMPOSIO_API_KEY);
  return client;
}

/** Manual tools.execute() rejects version "latest" unless this flag is set. */
export function executeComposioTool(
  composio: Composio,
  slug: string,
  params: { userId: string; arguments?: Record<string, unknown> },
) {
  return composio.tools.execute(slug, {
    ...params,
    dangerouslySkipVersionCheck: true,
  });
}

export async function listTools(userId = env.COMPOSIO_USER_ID, toolkit = "github") {
  if (!env.COMPOSIO_API_KEY) {
    return TOOLS.map((t) => ({
      slug: t.name,
      name: t.name,
      description: t.description,
      toolkit,
      mode: "mock" as const,
    }));
  }
  const tools = await getComposio().tools.get(userId, { toolkits: [toolkit] });
  return { tools, mode: "live" as const };
}

function listedToolItems(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "tools" in result) {
    const tools = (result as { tools: unknown }).tools;
    if (Array.isArray(tools)) return tools;
    if (tools && typeof tools === "object") return Object.values(tools as Record<string, unknown>);
  }
  if (result && typeof result === "object") return Object.values(result as Record<string, unknown>);
  return [];
}

function slugFromListedTool(tool: unknown): string | null {
  if (typeof tool === "string" && tool) return tool;
  if (!tool || typeof tool !== "object") return null;
  const row = tool as { slug?: unknown; name?: unknown; function?: { name?: unknown } };
  if (typeof row.slug === "string" && row.slug) return row.slug;
  if (typeof row.function?.name === "string" && row.function.name) return row.function.name;
  if (typeof row.name === "string" && /^[A-Z][A-Z0-9_]+$/.test(row.name)) return row.name;
  return null;
}

/** Live GitHub slugs when COMPOSIO_API_KEY is set. Seed slugs on missing key or API failure. */
export async function resolveGithubToolSlugs(preferred: string[]): Promise<string[]> {
  const fallback = preferred.length ? preferred : TOOLS.map((t) => t.name);
  if (!env.COMPOSIO_API_KEY) return fallback;
  try {
    const listed = await listTools();
    const live = listedToolItems(listed)
      .map(slugFromListedTool)
      .filter((slug): slug is string => Boolean(slug));
    if (!live.length) return fallback;
    const liveSet = new Set(live);
    const matched = fallback.filter((slug) => liveSet.has(slug));
    // Never substitute an arbitrary live GitHub action. The first page can
    // contain mutating tools (collaborators, issues, stars) that do not match
    // the requested cookbook contract.
    return matched.length ? matched : fallback;
  } catch (error) {
    console.warn("Composio listTools failed — using seed slugs", error instanceof Error ? error.message : error);
    return fallback;
  }
}
