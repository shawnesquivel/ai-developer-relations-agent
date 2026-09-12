# Docs that Test Themselves

Self-verifying AI cookbooks for the Composio SDK. Neo4j chooses the missing lesson, Nosana writes it, and every code block must pass in a fresh Daytona sandbox before the cookbook is marked verified.

`npm install && npm run dev` boots on [http://localhost:4317](http://localhost:4317) with zero credentials. Mock planner, author, sandbox, and graph stay visibly labeled.

## Flow

1. **Neo4j plans.** Seeded Composio concepts + `PREREQ_OF` edges. `PLAN_CYPHER` picks the undocumented concept that unlocks the most others.
2. **Nosana writes.** Strict Markdown: one H1, 2–4 independently runnable TypeScript blocks, PAT auth, no browser OAuth.
3. **Daytona verifies.** Each Run is a fresh TypeScript sandbox. Evidence is written back as `(:CodeBlock)-[:VERIFIED_BY]->(:Run)`. Verified only when every latest run passes.

## Run

Requires Node.js 22.

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:4317
```

```bash
npm run lint
npm run build
npm run start
```

Pre-UI Composio proof:

```bash
COMPOSIO_API_KEY=… GITHUB_PAT=… npx tsx scripts/composio-github-check.ts
```

## Local Neo4j

```bash
docker run --name cookbook-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/cookbook-local-password \
  -d neo4j:5-community
```

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=cookbook-local-password
NEO4J_DATABASE=neo4j
```

Or point `NEO4J_URI` at Aura (`neo4j+s://…`). Do not set both.

## Env

See `.env.example`. Live vs mock:

| Integration | Live when | Mock fallback |
| --- | --- | --- |
| Daytona | `DAYTONA_API_KEY` | Deterministic static analysis, labeled `(mock sandbox)` |
| Neo4j | `NEO4J_URI` + `NEO4J_PASSWORD` | Process-memory graph |
| Nosana | `NOSANA_ENDPOINT` | OpenAI if `OPENAI_API_KEY`, else deterministic Markdown |
| Composio | `COMPOSIO_API_KEY` | Static GitHub tool descriptors |

A configured-but-dead Nosana URL fails with 502 (no automatic OpenAI retry in P0).

`OPENAI_BASE_URL` is derived from `NOSANA_ENDPOINT` and injected into the sandbox only.

## API

```bash
curl -s localhost:4317/api/status
curl -s localhost:4317/api/cookbook
curl -s -X POST localhost:4317/api/cookbook/plan
curl -s -X POST localhost:4317/api/cookbook/generate -H 'content-type: application/json' \
  -d '{"conceptId":"c-tool-calling","conceptName":"Give an agent GitHub tools"}'
curl -s -X POST localhost:4317/api/cookbook/run -H 'content-type: application/json' \
  -d '{"cookbookId":"<id>","blockId":"<id>-b0"}'
curl -s 'localhost:4317/api/graph/subgraph?limit=500'
```

`/api/graph/query` and `/api/sandbox/run` are foundation/debug routes. Do not expose them publicly without auth.
