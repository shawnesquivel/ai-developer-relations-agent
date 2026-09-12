# Dennis — 52s product demo

Spoken copy plus click cues. Record at [http://localhost:4317](http://localhost:4317). Repo: [shawnesquivel/ai-developer-relations-agent](https://github.com/shawnesquivel/ai-developer-relations-agent).

**Total: ~52 seconds** (45–55s if you cut air; do not go past 60).

| Beat | Clock | Duration |
| --- | --- | --- |
| Painful hook | 0:00–0:10 | 10s |
| How it works | 0:10–0:22 | 12s |
| Demo | 0:22–0:50 | 28s |
| Punch | 0:50–0:52 | 2s |

---

## Pre-roll (not spoken)

Workbench already open. Four header tiles **LIVE**: Daytona sandboxes, Neo4j graph, LLM, Composio tools. If any tile says `mock`, stop and fix keys — do not fake LIVE.

Plan must land on **`tools.execute`**. If that lesson is already in the list, start from a clean graph so Plan cannot skip to Slack-shaped leftovers. Cursor stays in the Planner card. Do not click **Show Cypher**. Do not open **Share on X**.

---

## 0:00–0:10 · Painful hook

**SAY**

Claude writes docs that rot. Deps break. DevRel babysits every example — or engineers do. Agents are the next trillion users. They will ingest the lie at scale.

**ON-SCREEN**

Hold the workbench. Four LIVE tiles in frame. No click.

**NOTE**

Ten seconds. Short sentences. Money is the babysitting plus agents shipping the breakage. Do not name other products.

---

## 0:10–0:22 · How it works

**SAY**

Neo4j picks the missing SDK lesson. GPT-5.6 writes TypeScript. Daytona is the judge — only then it ships. Composio GitHub PAT who-am-I is the live proof.

**ON-SCREEN**

Same frame. Glance the four LIVE tiles as you name them. One breath. No feature list.

**NOTE**

Four sponsor names, once, in order: Neo4j → GPT-5.6 → Daytona → Composio. Then move.

---

## 0:22–0:50 · Demo

**SAY**

Simplest remaining lesson: tools.execute. Not Slack OAuth.

**CLICK** `Plan next cookbook`

Wait for the plan card: **tools.execute**, badge `live`.

**SAY**

That's the gap.

**CLICK** `2 · Write “tools.execute”`

Spinner is fine. Stay quiet if it takes a few seconds.

**ON-SCREEN after Write**

Right pane opens `# tools.execute who-am-I`. One TypeScript fence. `GITHUB_GET_THE_AUTHENTICATED_USER`. Badge **Unverified**. No Slack. No OAuth.

**SAY**

Twenty lines of TypeScript.

**CLICK** `Verify all blocks`

**SAY**

Fresh Daytona box. Green pass — that's your GitHub login. Verified.

**ON-SCREEN after Verify**

Judge should see all of this, or the take is dead:

- Header tiles still **LIVE**, not `mock`
- Plan card still `tools.execute` / `live`
- Block: green border, `passed`, exit `0` — **not** `(mock sandbox)`
- Stdout is the PAT who-am-I payload (login / id). Not a Slack bot. Not an OAuth redirect
- Cookbook list badge flips **Unverified** → **Verified**

**NOTE**

Do not click per-block **Run** unless Verify all is missing. If Write or Verify hangs past ~12s, cut to the green tile and keep the last two sentences. Never narrate a mock as live.

---

## 0:50–0:52 · Punch

**SAY**

Dennis is the AI Native Developer Relations Engineer.

**ON-SCREEN**

Hold the verified who-am-I. Cut on the period. No thank-you. No QR.

---

## Appendix — punch line alts

Preferred is in the script. Two more if the room wants a different last line:

1. Docs that don't ship until they run.
2. The next DevRel hire verifies its own cookbooks.
