import Link from "next/link";
import { getWishlist } from "@/lib/db/queries";
import { WishlistCard } from "@/components/album/wishlist-button";
import { Button } from "@/components/ui/button";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { auth } from "@/lib/auth";
import { Heart } from "lucide-react";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Wishlist</h1>
        <p className="mt-2 text-zinc-400">
          Records you are considering — bring this list to the shop.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <Heart className="mx-auto h-12 w-12 text-zinc-700" />
          <p className="mt-4 text-zinc-400">No saved records yet.</p>
          <Link href="/discover" className="mt-4 inline-block">
            <Button>Browse Discover</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <WishlistCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
