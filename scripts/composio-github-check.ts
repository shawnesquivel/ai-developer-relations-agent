import { AuthScheme } from "@composio/core";
import { createComposio, executeComposioTool } from "../lib/composio";

const apiKey = process.env.COMPOSIO_API_KEY;
const pat = process.env.GITHUB_PAT;
const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";

function redactExecuteResult(result: unknown) {
  if (!result || typeof result !== "object") return { kind: typeof result };
  const row = result as { successful?: boolean; error?: unknown; data?: unknown };
  return {
    successful: Boolean(row.successful) || Boolean(row.data),
    hasData: Boolean(row.data),
    error: row.error ? "[redacted]" : undefined,
  };
}

async function main() {
  if (!apiKey) {
    console.log("No COMPOSIO_API_KEY — mock explanation only.");
    console.log("Would fetch GITHUB_GET_THE_AUTHENTICATED_USER, list repos, and create-issue schemas.");
    console.log("With a PAT, would create custom bearer auth and execute the read-only who-am-I tool.");
    process.exit(0);
  }

  const composio = createComposio(apiKey);
  const slugs = [
    "GITHUB_GET_THE_AUTHENTICATED_USER",
    "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    "GITHUB_CREATE_AN_ISSUE",
  ];
  const tools = await composio.tools.get(userId, { tools: slugs });
  console.log("fetched schemas", Array.isArray(tools) ? tools.length : Object.keys(tools ?? {}).length);

  if (!pat) {
    console.log("No GITHUB_PAT — schemas only. Execution skipped.");
    process.exit(0);
  }

  const authConfig = await composio.authConfigs.create("github", {
    type: "use_custom_auth",
    authScheme: "BEARER_TOKEN",
    credentials: {},
  });
  await composio.connectedAccounts.initiate(userId, authConfig.id, {
    config: AuthScheme.BearerToken({ token: pat }),
  });
  const result = await executeComposioTool(composio, "GITHUB_GET_THE_AUTHENTICATED_USER", {
    userId,
    arguments: {},
  });
  const successful =
    result &&
    typeof result === "object" &&
    (("successful" in result && Boolean((result as { successful?: boolean }).successful)) ||
      ("data" in result && (result as { data?: unknown }).data));
  console.log(JSON.stringify(redactExecuteResult(result)));
  if (!successful) {
    console.error("GITHUB_GET_THE_AUTHENTICATED_USER was not successful");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
