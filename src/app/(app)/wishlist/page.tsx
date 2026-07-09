import Link from "next/link";
import { getWishlist, getLatestPriceSnapshot } from "@/lib/db/queries";
import { WishlistCard } from "@/components/album/wishlist-button";
import { Button } from "@/components/ui/button";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger";
import { Disc3, Heart } from "lucide-react";
import { PRICE_DROP_THRESHOLD } from "@/lib/commerce/price-alerts";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <SignInPrompt
        title="Connect Spotify to see your wishlist"
        description="Sign in to save and view records you're considering."
      />
    );
  }

  const wishlist = await getWishlist(session.user.id);

  // A pure DB read per item (no Discogs calls) — cheap even N+1, since
  // wishlists are small and this only runs on page load, not per request
  // elsewhere. Same "meaningful drop" bar as the email alerts, so the badge
  // here and what triggers an email agree on what counts as a real drop.
  const items = await Promise.all(
    wishlist.map(async (item) => {
      const latest = await getLatestPriceSnapshot(item.discogsReleaseId);
      const baseline = item.lastAlertedPrice ?? item.priceAtAdd;
      const priceDrop =
        baseline != null &&
        latest?.lowestPrice != null &&
        latest.lowestPrice <= baseline * (1 - PRICE_DROP_THRESHOLD)
          ? { from: baseline, to: latest.lowestPrice }
          : null;
      return { ...item, priceDrop };
    }),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Wishlist</h1>
          <p className="mt-2 text-muted">
            Records you are considering — bring this list to the shop.
          </p>
        </div>
        {items.length > 0 && (
          <Badge variant="accent">{items.length} saved</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your shelf is empty"
          description="Save albums while browsing to build your list."
        >
          <Link href="/discover" className="mt-6 inline-block">
            <Button>Browse Discover</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="wishlist-shelf relative pb-2">
            <div className="absolute -bottom-1 left-0 right-0 flex items-center gap-2">
              <Disc3 className="h-4 w-4 text-muted" />
              <span className="text-xs text-muted">Your shelf · {items.length} records</span>
            </div>
          </div>
          <StaggerContainer className="space-y-3">
            {items.map((item) => (
              <StaggerItem key={item.id}>
                <WishlistCard item={item} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      )}
    </div>
  );
}
