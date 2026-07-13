import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FunnelResult } from "@/lib/analytics/metrics";

/** "search_result_click" -> "Search result click". */
function formatStageLabel(type: string): string {
  const words = type.split("_");
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + " " + words.slice(1).join(" ");
}

export function FunnelDisplay({ title, funnel }: { title: string; funnel: FunnelResult }) {
  const hasData = funnel.stages.some((s) => s.users > 0);
  const maxUsers = Math.max(...funnel.stages.map((s) => s.users), 1);

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {!hasData ? (
        <p className="mt-3 text-sm text-muted">No data yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {funnel.stages.map((stage, i) => (
            <div key={stage.type}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{formatStageLabel(stage.type)}</span>
                <span className="text-muted">{stage.users}</span>
              </div>
              <Progress value={(stage.users / maxUsers) * 100} className="mt-1.5" />
              {i > 0 && funnel.conversionRates[i - 1] != null && (
                <p className="mt-1 text-xs text-muted">
                  {Math.round(funnel.conversionRates[i - 1]! * 100)}% from previous step
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
