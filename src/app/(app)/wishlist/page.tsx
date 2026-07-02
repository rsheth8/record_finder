import Link from "next/link";
import { getWishlist } from "@/lib/db/queries";
import { WishlistCard } from "@/components/album/wishlist-button";
import { Button } from "@/components/ui/button";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Disc3, Heart } from "lucide-react";

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

  const items = await getWishlist(session.user.id);

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
        <div className="py-20 text-center">
          <div className="relative mx-auto mb-6 w-fit">
            <Heart className="h-14 w-14 text-muted/40" />
            <div className="wishlist-shelf absolute -bottom-3 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">Your shelf is empty</p>
          <p className="mt-2 text-sm text-muted">Save albums while browsing to build your list.</p>
          <Link href="/discover" className="mt-6 inline-block">
            <Button>Browse Discover</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="wishlist-shelf relative pb-2">
            <div className="absolute -bottom-1 left-0 right-0 flex items-center gap-2">
              <Disc3 className="h-4 w-4 text-muted" />
              <span className="text-xs text-muted">Your shelf · {items.length} records</span>
            </div>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <WishlistCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
