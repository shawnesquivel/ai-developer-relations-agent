import { resolveGithubToolSlugs } from "./composio";
import { createCookbook, toolsForConcept } from "./cookbooks";
import { generateCookbook } from "./generate";
import type { Cookbook } from "./graph-types";

export async function buildCookbook(
  conceptId: string,
  conceptName: string,
): Promise<{ cookbook: Cookbook; provider: string; model: string; slugs: string[] }> {
  const seedSlugs = await toolsForConcept(conceptId);
  const slugs = await resolveGithubToolSlugs(seedSlugs);
  const generated = await generateCookbook(conceptName, slugs);
  const cookbook = await createCookbook({
    conceptId,
    conceptName,
    markdown: generated.markdown,
    provider: generated.provider,
  });
  return { cookbook, provider: generated.provider, model: generated.model, slugs };
}
