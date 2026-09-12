import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SourceConcept = {
  id: string;
  name: string;
  sourcePath: string;
  sourceSymbol: string;
  sourceHash: string;
  evidence: string;
};

const root = process.cwd();
const installedRoot = path.join(root, "node_modules", "@composio", "core");
const siblingRoot = path.resolve(root, "..", "composio", "ts", "packages", "core");

async function resolvePackageRoot() {
  const requested = process.env.COMPOSIO_SOURCE_ROOT;
  if (requested) {
    await access(path.join(requested, "src", "composio.ts"));
    return requested;
  }
  const candidates = [siblingRoot, installedRoot].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const available: { root: string; version: number[] }[] = [];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "src", "composio.ts"));
      const pkg = JSON.parse(await readFile(path.join(candidate, "package.json"), "utf8")) as {
        version?: string;
      };
      available.push({
        root: candidate,
        version: (pkg.version ?? "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0),
      });
    } catch {
      // Try the next source. Vercel uses the installed package fallback.
    }
  }
  available.sort((a, b) => {
    for (let i = 0; i < Math.max(a.version.length, b.version.length); i++) {
      const difference = (b.version[i] ?? 0) - (a.version[i] ?? 0);
      if (difference) return difference;
    }
    return 0;
  });
  if (available[0]) return available[0].root;
  throw new Error("Could not find @composio/core source");
}

async function read(packageRoot: string, relativePath: string) {
  return readFile(path.join(packageRoot, relativePath), "utf8");
}

function hash(source: string) {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function requirePattern(source: string, pattern: RegExp, label: string) {
  if (!pattern.test(source)) {
    throw new Error(`@composio/core source no longer exposes ${label}`);
  }
}

async function main() {
  const packageRoot = await resolvePackageRoot();
  const packageJson = JSON.parse(await read(packageRoot, "package.json")) as {
    version: string;
    gitHead?: string;
  };
  const files = {
    composio: await read(packageRoot, "src/composio.ts"),
    tools: await read(packageRoot, "src/models/Tools.ts"),
    authConfigs: await read(packageRoot, "src/models/AuthConfigs.ts"),
    connectedAccounts: await read(packageRoot, "src/models/ConnectedAccounts.ts"),
    toolRouter: await read(packageRoot, "src/models/ToolRouter.ts"),
    toolkits: await read(packageRoot, "src/models/Toolkits.ts"),
    triggers: await read(packageRoot, "src/models/Triggers.ts"),
  };

  requirePattern(files.composio, /export class Composio/, "Composio");
  requirePattern(files.composio, /tools:\s*Tools/, "Composio.tools");
  requirePattern(files.tools, /async get\s*\(/, "Tools.get");
  requirePattern(files.tools, /async execute\s*\(/, "Tools.execute");
  requirePattern(files.authConfigs, /async create\s*\(/, "AuthConfigs.create");
  requirePattern(files.connectedAccounts, /async initiate\s*\(/, "ConnectedAccounts.initiate");
  requirePattern(files.toolRouter, /async create\s*\(/, "Sessions.create");
  requirePattern(files.toolkits, /async get\s*\(/, "Toolkits.get");
  requirePattern(files.triggers, /async create\s*\(/, "Triggers.create");

  const concept = (
    id: string,
    name: string,
    sourcePath: keyof typeof files,
    sourceSymbol: string,
    evidence: string,
  ): SourceConcept => ({
    id,
    name,
    sourcePath:
      sourcePath === "composio"
        ? "src/composio.ts"
        : `src/models/${sourcePath[0].toUpperCase()}${sourcePath.slice(1)}.ts`,
    sourceSymbol,
    sourceHash: hash(files[sourcePath]),
    evidence,
  });

  const concepts = [
    concept("c-client", "new Composio({ apiKey })", "composio", "Composio", "export class Composio"),
    concept("c-tools-get", "composio.tools.get", "tools", "Tools.get", "async get(...)"),
    concept("c-auth-configs", "composio.authConfigs.create", "authConfigs", "AuthConfigs.create", "async create(...)"),
    concept(
      "c-connected-accounts",
      "composio.connectedAccounts.initiate",
      "connectedAccounts",
      "ConnectedAccounts.initiate",
      "async initiate(...)",
    ),
    concept("c-execute", "composio.tools.execute", "tools", "Tools.execute", "async execute(...)"),
    concept("c-sessions", "composio.sessions.create", "toolRouter", "ToolRouter.create", "async create(...)"),
    concept("c-toolkits", "composio.toolkits.get", "toolkits", "Toolkits.get", "async get(...)"),
    concept("c-triggers", "composio.triggers.create", "triggers", "Triggers.create", "async create(...)"),
    concept("c-tool-bind", "framework tool adapter", "tools", "Tools.get + Tools.execute", "get schema, adapt, execute"),
  ];

  const output = `// Generated by scripts/sync-sdk-source.ts. Do not edit by hand.
export const SDK_SOURCE = ${JSON.stringify(
    {
      packageName: "@composio/core",
      packageVersion: packageJson.version,
      gitHead: packageJson.gitHead ?? null,
      sourceKind: packageRoot === installedRoot ? "installed-package" : "local-monorepo",
      concepts,
    },
    null,
    2,
  )} as const;
`;
  await writeFile(path.join(root, "lib", "sdk-source.generated.ts"), output);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
