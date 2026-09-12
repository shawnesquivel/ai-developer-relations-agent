import { StatusPanel } from "@/components/status-panel";
import { Workbench } from "@/components/workbench";
import { integrationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const statuses = integrationStatuses();
  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Docs that test themselves</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Self-verifying cookbooks for the Composio SDK. <b>Neo4j</b> decides which concept to document next, a model on <b>Nosana</b> writes
            it, and every code block proves itself by running in a fresh <b>Daytona</b> sandbox. A cookbook is published only when all of its
            code runs.
          </p>
        </div>
        <div className="w-full lg:w-[420px]">
          <StatusPanel statuses={statuses} compact />
        </div>
      </header>
      <Workbench />
    </main>
  );
}
