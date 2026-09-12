import { StatusPanel } from "@/components/status-panel";
import { Workbench } from "@/components/workbench";
import { integrationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const integrations = integrationStatuses();
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-normal leading-[1.25] tracking-[-0.012em]">
            Dennis, the AI Native Developer Relations
          </h1>
          <p className="mt-2 max-w-2xl font-serif text-[17px] leading-[1.5] text-driftwood">
            Neo4j picks the simplest remaining <span className="text-ember">@composio/core</span> lesson. Dennis writes
            a TypeScript cookbook. Daytona runs every block before it is marked verified.
          </p>
        </div>
        <div className="w-full xl:w-[420px] xl:shrink-0">
          <StatusPanel integrations={integrations} />
        </div>
      </header>
      <Workbench />
    </div>
  );
}
