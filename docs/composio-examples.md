# Composio official examples (cookbook targets)

Live index: https://docs.composio.dev/examples  
`/cookbooks` redirects there. This project does **not** vendor the docs.

Local clone (full docs tree, not copied here): `/Users/shawnesquivel/GitHub/composio`  
- Live index MDX: `docs/content/examples/index.mdx` (3 cards in the clone; live site also lists iMessage)  
- Clone nav: `docs/content/examples/meta.json` (includes Email support agent)  
- Runnable sources: `docs/examples/standup-slackbot`, `docs/examples/email-support-agent`

Generated cookbooks in this repo stay on the allowlisted TS SDK + **PAT, not OAuth**: `toolkitVersions: { github: "latest" }` and `dangerouslySkipVersionCheck: true` on `tools.execute`.

## The five examples

### 1. Build a Slack bot that can do work with you and your team
- URL: https://docs.composio.dev/examples/general-agent-with-pi
- Idea: Pi agent in Slack. Triggers → per-user sessions → one SHARED workspace Slack connection → redirect auth links out of the channel → `session.proxyExecute` for Slack Web API gaps.
- Official TS (docs / clone): `new Composio`, `authConfigs.create("slackbot", { type: "use_composio_managed_auth" })`, `composio.create(userId, { toolkits, authConfigs, manageConnections })`, `session.authorize`, `connectedAccounts.updateAcl`, `triggers.setWebhookSubscription`, `triggers.create`, `triggers.verifyWebhook`, `session.proxyExecute`, `SLACKBOT_SEND_MESSAGE`.
- Allowlisted stand-in: `tools.get` + PAT `authConfigs.create` / `connectedAccounts.initiate` + `tools.execute`.

### 2. Daily standup bot
- URL: https://docs.composio.dev/examples/standup-slackbot
- Source: `/Users/shawnesquivel/GitHub/composio/docs/examples/standup-slackbot`
- Idea: Cron reminder, white-label Slack app, deterministic `tools.execute` for buttons, tool-router session only for the draft (`manageConnections: false`).
- Official TS: `new Composio({ provider: new VercelProvider() })`, `composio.create(memberEmail, { toolkits, manageConnections: false })`, `session.tools()`, `tools.execute(slug, { userId, arguments })`, `tools.proxyExecute`, `connectedAccounts.list`, `toolkits.authorize`.
- Allowlisted stand-in: same PAT execute path; treat GitHub list/whoami as “already connected sources”.

### 3. Local sandbox PR reviewer
- URL: https://docs.composio.dev/examples/local-sandbox-pr-reviewer
- Repo: https://github.com/ComposioHQ/local-pr-reviewer
- Idea: Tool Router session with `workbench.enable: false`, inject helper into a sandbox you own (E2B is the sample), post a comment only if real checks ran.
- Official: `composio.create` + `experimental_createLocalWorkbenchSession`, GitHub via `run_composio_tool` inside the box.
- Allowlisted stand-in: PAT connect, then `tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER")` as the pre-review identity check.

### 4. iMessage custom toolkit with eve
- URL: https://docs.composio.dev/examples/imessage-agent
- Idea: In-process custom toolkit on the same session as the catalog; eve provider; triggers wake the agent.
- Official TS: `experimental_createTool` / `experimental_createToolkit`, `sessions.create` + `experimental.customToolkits`, `defineComposioTools(session)`, `composio.triggers.parse` / `setWebhookSubscription` / `create`.
- Allowlisted stand-in: PAT + `tools.get` / `tools.execute` as the local tool surface.

### 5. Email support agent
- Intended URL: https://docs.composio.dev/examples/email-support-agent (404 on the live site as of 2026-09-12)
- Clone: `/Users/shawnesquivel/GitHub/composio/docs/content/examples/email-support-agent.mdx` and `docs/examples/email-support-agent` (Python)
- Idea: Gmail trigger → signed webhook → scoped session tools → LangGraph draft path → Notion review trail.
- Official: `Composio().create(...)`, `session.tools()`, `session.authorize`, `triggers.create` / `verify_webhook`, Gmail + Notion slugs only.
- Allowlisted stand-in: bounded `tools.get` list + one PAT `tools.execute`.

## Planner graph

Documented SDK prereqs (from `@composio/core`): `c-client` → `c-toolkits` → `c-tools-get` → `c-auth-scheme` → `c-auth-configs` → `c-connected-accounts`.  
Undocumented chain (Plan picks the first): `tools.execute` → Slack/Pi → standup → PR reviewer → iMessage/eve → email/LangChain.
