import { conceptForPrompt } from "./articles";
import { resolveGithubToolSlugs } from "./composio";
import { createCookbook, toolsForConcept } from "./cookbooks";
import { generateCookbook, generateCookbookFromPrompt } from "./generate";
import type { Cookbook } from "./graph-types";

export type BuildProgressStep = "source" | "context" | "writing" | "persisting";
export type BuildProgress = (step: BuildProgressStep, detail: string) => void;

export async function buildCookbook(
  conceptId: string,
  conceptName: string,
  onProgress?: BuildProgress,
): Promise<{ cookbook: Cookbook; provider: string; model: string; slugs: string[] }> {
  onProgress?.("source", "Reading the source-derived SDK concept graph");
  const seedSlugs = await toolsForConcept(conceptId);
  onProgress?.("context", "Loading matching Composio tool schemas");
  const slugs = await resolveGithubToolSlugs(seedSlugs);
  onProgress?.("writing", "Writing the article and independently runnable blocks");
  const generated = await generateCookbook(conceptName, slugs);
  onProgress?.("persisting", "Persisting the article, blocks, and coverage in Neo4j");
  const cookbook = await createCookbook({
    conceptId,
    conceptName,
    markdown: generated.markdown,
    provider: generated.provider,
  });
  return { cookbook, provider: generated.provider, model: generated.model, slugs };
}

export async function buildCookbookFromPrompt(
  prompt: string,
  onProgress?: BuildProgress,
): Promise<{ cookbook: Cookbook; provider: string; model: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("missing prompt");
  onProgress?.("source", "Matching the prompt to source-derived SDK concepts");
  const { conceptId, conceptName } = conceptForPrompt(trimmed);
  onProgress?.("context", "Loading the concept graph and live Composio tool schemas");
  const slugs = await resolveGithubToolSlugs(await toolsForConcept(conceptId));
  onProgress?.("writing", "Writing a 500–900 word cookbook with runnable blocks");
  const generated = await generateCookbookFromPrompt(trimmed, slugs);
  onProgress?.("persisting", "Persisting the article, blocks, and source coverage in Neo4j");
  const cookbook = await createCookbook({
    conceptId,
    conceptName,
    markdown: generated.markdown,
    provider: generated.provider,
  });
  return { cookbook, provider: generated.provider, model: generated.model };
}
