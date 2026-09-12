/**
 * Bare proof that Composio can execute a GitHub tool with a personal access token (no OAuth).
 *
 *   COMPOSIO_API_KEY=... GITHUB_PAT=ghp_... npx tsx scripts/composio-github-check.ts
 *
 * Without COMPOSIO_API_KEY it prints what it would do and exits 0 so CI/mock runs stay green.
 */
import { AuthScheme, Composio } from "@composio/core";

const USER_ID = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const pat = process.env.GITHUB_PAT;
  if (!apiKey) {
    console.log("[mock] COMPOSIO_API_KEY not set — would create a GitHub auth config, link a PAT-backed connected account, and call GITHUB_GET_THE_AUTHENTICATED_USER.");
    return;
  }
  const composio = new Composio({ apiKey });

  // 1. Tool schemas exist without any connected account.
  const tools = await composio.tools.get(USER_ID, { toolkits: ["github"], limit: 3 });
  console.log(`github toolkit: ${tools.length} tool schema(s) fetched`);

  // 2. Connected account from a PAT: bearer-token auth config, no browser redirect.
  if (pat) {
    const authConfig = await composio.authConfigs.create("github", {
      type: "use_custom_auth",
      authScheme: "BEARER_TOKEN",
      credentials: {},
      name: "hacksprint-github-pat",
    });
    const conn = await composio.connectedAccounts.initiate(USER_ID, authConfig.id, {
      config: AuthScheme.BearerToken({ token: pat }),
    });
    console.log(`connected account ${conn.id}: ${conn.status}`);
  } else {
    console.log("GITHUB_PAT not set — reusing whatever connected account already exists for", USER_ID);
  }

  // 3. The call that has to land: who am I on GitHub?
  const res = await composio.tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {
    userId: USER_ID,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log("execute →", res.successful ? "OK" : "FAILED", JSON.stringify(res.data ?? res.error).slice(0, 300));
  if (!res.successful) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
