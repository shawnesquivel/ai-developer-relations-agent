# Docs that test themselves

Self-verifying AI cookbooks for the Composio SDK, built at Daytona HackSprint Tokyo. Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui, with three sponsor SDKs integrated at code level behind small typed clients. Every client has an env-driven mock fallback, so the whole app runs with zero credentials.

## How it works

1. **Neo4j is the planner.** A seeded concept graph (`lib/seed.ts`: Composio concepts, the GitHub toolkit and its real tool slugs, `PREREQ_OF` / `EXPOSES` / `DEMONSTRATES` edges, a `documented` flag). One Cypher traversal (`PLAN_CYPHER` in `lib/cookbooks.ts`) picks the undocumented concept that unblocks the most others. The pick is highlighted in the 3D graph.
2. **Nosana writes the cookbook.** `lib/generate.ts` prompts an OpenAI-compatible endpoint for an OpenAI/Anthropic-cookbook style article with independent TypeScript code blocks. The first cookbook is "Give an agent GitHub tools in 20 lines", using a personal access token instead of OAuth.
3. **Daytona verifies it.** Every code block has a Run button. `runCodeBlock` in `lib/daytona.ts` creates a fresh sandbox, uploads the block as `block.ts`, installs `@composio/core openai tsx`, runs it, and deletes the sandbox. The result is written back as a `(:CodeBlock)-[:VERIFIED_BY]->(:Run)` node. Blocks turn green/red inline.
4. When every block passes, the cookbook gets `documented=true` and a `(:Cookbook)-[:TEACHES]->(:Concept)` edge; the graph updates live. Two verified cookbooks and one deliberately broken one are pre-seeded. "Share on X" is a plain intent URL.

Credentials only ever enter the Daytona sandbox as env vars (`COMPOSIO_API_KEY`, `GITHUB_PAT`, `OPENAI_BASE_URL` pointed at Nosana) — LLM-generated code never runs in the Next.js process.

`scripts/composio-github-check.ts` is the bare proof of the PAT-based Composio GitHub tool call: `COMPOSIO_API_KEY=… GITHUB_PAT=… npx tsx scripts/composio-github-check.ts`.

| Integration | Module | SDK | Env |
| --- | --- | --- | --- |
| Daytona sandboxes | `lib/daytona.ts` | `@daytonaio/sdk` | `DAYTONA_API_KEY`, `DAYTONA_TARGET` |
| Neo4j Aura graph | `lib/neo4j.ts` | `neo4j-driver` | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` |
| Nosana inference | `lib/llm.ts` | `openai` (OpenAI-compatible) | `NOSANA_ENDPOINT`, `NOSANA_API_KEY`, `NOSANA_MODEL` → falls back to `OPENAI_API_KEY` → mock |
| Composio tools | `lib/composio.ts` | `@composio/core` | `COMPOSIO_API_KEY` |

## Run

```bash
npm install
cp .env.example .env.local   # optional — fill in whatever you have
npm run dev                  # http://localhost:4317
```

The home page shows which integrations are live vs mocked and renders the graph from `/api/graph/subgraph` in `react-force-graph-3d` (mock mode seeds a small sponsor/capability graph).

## API

Cookbook flow:

```bash
curl -s -X POST localhost:4317/api/cookbook/plan                        # Neo4j picks the concept
curl -s -X POST localhost:4317/api/cookbook/generate -H 'content-type: application/json' \
  -d '{"conceptId":"c-tool-calling","conceptName":"Tool calling with an LLM"}'
curl -s -X POST localhost:4317/api/cookbook/run -H 'content-type: application/json' \
  -d '{"cookbookId":"<id>","blockId":"<id>-b0"}'                        # Daytona runs one block
curl -s localhost:4317/api/cookbook                                    # all cookbooks + broken list
```

Foundation routes:

```bash
# Daytona: run code or a shell command in a fresh sandbox (deleted afterwards)
curl -s localhost:4317/api/sandbox/run -H 'content-type: application/json' \
  -d '{"code":"print(sum(range(10)))","language":"python"}'

# Neo4j: parameterised Cypher
curl -s localhost:4317/api/graph/query -H 'content-type: application/json' \
  -d '{"cypher":"MATCH (n:Sponsor) RETURN n LIMIT 10"}'

# Neo4j: upsert nodes + relationships
curl -s localhost:4317/api/graph/query -H 'content-type: application/json' \
  -d '{"nodes":[{"id":"t1","label":"Task","props":{"name":"demo"}}],"relationships":[{"from":"app","to":"t1","type":"RAN"}]}'

# Neo4j: {nodes, links} for the 3D graph
curl -s 'localhost:4317/api/graph/subgraph?limit=200'

# LLM: Nosana (or OpenAI, or mock)
curl -s localhost:4317/api/llm/chat -H 'content-type: application/json' \
  -d '{"prompt":"Write Python that prints the first 5 primes."}'

# Which integrations are live
curl -s localhost:4317/api/status
```

## Client modules

- `lib/daytona.ts` — `runInSandbox({ command?, code?, language? })` creates a sandbox, runs, returns `{ stdout, exitCode, sandboxId, mode }`, and always deletes the sandbox (billing is on running/stopped sandboxes). `createSandbox` / `deleteSandbox` exposed for longer-lived use.
- `lib/neo4j.ts` — `runCypher`, `upsertNodes`, `upsertRelationships`, `fetchSubgraph` (→ `{ nodes, links}`), `ensureVectorIndex` (cosine, 1536 dims default), `vectorSearch` (`db.index.vector.queryNodes`). Mock mode is an in-memory graph.
- `lib/llm.ts` — `chat` / `chatStream` over an OpenAI-compatible endpoint. Provider order: Nosana → OpenAI → deterministic mock. Strips DeepSeek-R1 `<think>` blocks.
- `lib/composio.ts` — `getComposio()` and `listTools(userId, toolkit)`.
- `lib/env.ts` — env parsing and `integrationStatuses()`.

## Nosana notes

Deploy the `deepseek-r1-qwen-1-5b` template from [deploy.nosana.com](https://deploy.nosana.com/) on a 3060-class market (needs ~6 GB VRAM). It runs vLLM's OpenAI server on port 9000; copy the deployment URL from the dashboard into `NOSANA_ENDPOINT`. The served model name is `DeepSeek-R1-Distill-Qwen-1.5B`. Cold start can take up to ~5 minutes, and `INSUFFICIENT_FUNDS` shows up as deployment status rather than an error.
