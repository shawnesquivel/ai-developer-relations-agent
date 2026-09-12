import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IntegrationStatus } from "@/lib/env";

export function StatusPanel({ statuses, compact = false }: { statuses: IntegrationStatus[]; compact?: boolean }) {
  const liveCount = statuses.filter((s) => s.mode === "live").length;
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 text-xs sm:grid-cols-4 lg:grid-cols-2">
        {statuses.map((s) => (
          <div key={s.name} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5" title={s.detail}>
            <span className="truncate font-medium">{s.label}</span>
            <Badge variant={s.mode === "live" ? "default" : "secondary"} className="shrink-0 px-1.5 text-[10px] uppercase">
              {s.mode}
            </Badge>
          </div>
        ))}
      </div>
    );
  }
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          {liveCount} of {statuses.length} live. Mocked services return deterministic data so every route works without credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {statuses.map((s) => (
          <div key={s.name} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="font-medium">{s.label}</div>
              <div className="text-muted-foreground text-xs break-words">{s.detail}</div>
            </div>
            <Badge variant={s.mode === "live" ? "default" : "secondary"} className="shrink-0 uppercase tracking-wide">
              {s.mode}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
