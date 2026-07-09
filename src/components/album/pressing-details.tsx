import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { DiscogsRelease } from "@/lib/types";
import { Disc3 } from "lucide-react";

/** Surfaces the pressing-level detail Discogs already returns on every
 * `/releases/{id}` call but the app didn't previously parse — matrix/runout
 * etchings, mastering credits, pressing-plant/label credits, and freeform
 * pressing notes. This is exactly the kind of detail audiophile collectors
 * currently have to dig for across forums; here it's just already-fetched
 * data we weren't showing. Renders nothing if the release has none of it
 * (older/thinner Discogs entries often don't). */
export function PressingDetails({ release }: { release: DiscogsRelease }) {
  const matrixRunouts = release.identifiers.filter(
    (i) => i.type === "Matrix / Runout",
  );
  const masteringCredits = release.extraArtists.filter((a) =>
    a.role.toLowerCase().includes("mastered"),
  );
  const companies = release.companies.filter((c) => c.name && c.entityTypeName);

  const hasAnything =
    !!release.notes ||
    matrixRunouts.length > 0 ||
    masteringCredits.length > 0 ||
    companies.length > 0;

  if (!hasAnything) return null;

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="relative h-14 w-14 shrink-0 rounded-full bg-surface-elevated">
          <Disc3 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-accent" />
        </div>
        <div className="flex-1 space-y-4">
          <CardTitle>Pressing details</CardTitle>

          {masteringCredits.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Mastered by
              </p>
              <CardDescription className="mt-1">
                {masteringCredits.map((a) => a.name).join(", ")}
              </CardDescription>
            </div>
          )}

          {companies.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Credits
              </p>
              <ul className="mt-1 space-y-0.5">
                {companies.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="text-sm text-muted">
                    {c.entityTypeName}: {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matrixRunouts.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Matrix / runout
              </p>
              <ul className="mt-1 space-y-1">
                {matrixRunouts.map((id, i) => (
                  <li key={i} className="font-mono text-xs text-muted">
                    {id.description ? `${id.description}: ` : ""}
                    {id.value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {release.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Pressing notes
              </p>
              <CardDescription className="mt-1 whitespace-pre-line">
                {release.notes}
              </CardDescription>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
