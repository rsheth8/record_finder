import { getOffers } from "@/lib/offers/orchestrator";
import { hasAffiliateLink } from "@/lib/offers/affiliate";
import type { Offer, OfferSource } from "@/lib/offers/types";
import type { DiscogsRelease } from "@/lib/types";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/commerce/pricing";
import { cn } from "@/lib/utils";
import { ExternalLink, ShieldCheck, Sparkles, Store } from "lucide-react";

const SOURCE_LABELS: Record<OfferSource, string> = {
  discogs: "Discogs",
  "google-shopping": "Google Shopping",
  ebay: "eBay",
  shopify: "local shops",
  walmart: "Walmart",
};

/**
 * "Where to buy" — the multi-source offer panel. Async Server Component streamed
 * behind a `<Suspense>` boundary (like SimilarReleases), since the meta-search
 * is a slow, networked, paid call that shouldn't block the album page. Offers
 * arrive pre-ranked cheapest-first from the orchestrator.
 */
export async function WhereToBuy({ release }: { release: DiscogsRelease }) {
  const { offers, sources } = await getOffers(release);
  if (offers.length === 0) return null;

  const contributing = sources
    .filter((s) => s.ok && s.count > 0)
    .map((s) => SOURCE_LABELS[s.source]);

  return (
    <Card className="stream-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>Where to buy</CardTitle>
          <CardDescription className="mt-1">
            Cheapest first, across every source we could match.
          </CardDescription>
        </div>
        <Badge variant="accent" className="shrink-0">
          {offers.length} offer{offers.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <ul className="mt-4 space-y-2">
        {offers.map((offer, i) => (
          <OfferRow key={`${offer.url}-${i}`} offer={offer} best={i === 0} />
        ))}
      </ul>

      <div className="mt-4 space-y-1.5 border-t border-border-subtle pt-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-success" /> Verified = this exact release
          </span>
          <span aria-hidden>·</span>
          <span>Likely = matched by artist &amp; title</span>
        </p>
        {contributing.length > 0 && (
          <p className="text-xs text-muted">
            Prices from {contributing.join(" + ")}. Confirm condition &amp; shipping on the
            seller&apos;s site before buying.
          </p>
        )}
        {hasAffiliateLink(offers) && (
          <p className="text-[11px] text-muted/70">
            Some links are affiliate links — we may earn a commission at no extra cost to
            you.
          </p>
        )}
      </div>
    </Card>
  );
}

function ConfidenceBadge({ tier }: { tier: Offer["matchTier"] }) {
  if (tier === "verified") {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  if (tier === "possible") {
    return <Badge variant="warning">Possible</Badge>;
  }
  return <Badge variant="default">Likely match</Badge>;
}

function shippingNote(offer: Offer): string {
  if (offer.shipping == null) return "plus shipping";
  if (offer.shipping === 0) return "free shipping";
  return `+ ${formatUsd(offer.shipping)} shipping`;
}

function OfferRow({ offer, best }: { offer: Offer; best: boolean }) {
  return (
    <li>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={cn(
          "focus-ring group flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors",
          best
            ? "border-accent/40 bg-accent-muted/40"
            : "border-border bg-surface/40 hover:border-accent/40 hover:bg-surface-elevated",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
              <Store className="h-3.5 w-3.5 shrink-0 text-muted" />
              {offer.sellerName ?? "Unknown seller"}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted/70">
              {SOURCE_LABELS[offer.source]}
            </span>
            <ConfidenceBadge tier={offer.matchTier} />
            {best && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                <Sparkles className="h-3 w-3" />
                Best price
              </span>
            )}
          </div>
          {offer.condition && (
            <p className="mt-0.5 truncate text-xs text-muted">{offer.condition}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="font-semibold text-foreground">
              {offer.price != null ? formatUsd(offer.price) : "See price"}
            </div>
            <div className="text-[10px] text-muted">{shippingNote(offer)}</div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted transition-colors group-hover:text-accent" />
        </div>
      </a>
    </li>
  );
}
