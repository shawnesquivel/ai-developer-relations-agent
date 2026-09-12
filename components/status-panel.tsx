import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus } from "@/lib/env";

export function StatusPanel({ integrations }: { integrations: IntegrationStatus[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
      {integrations.map((item) => (
        <div key={item.name} className="rounded border border-border bg-card p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{item.label}</span>
            <Badge variant={item.mode === "live" ? "live" : "mock"}>{item.mode}</Badge>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
