import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCreditBalance, getReservation } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { formatCredits } from "@/lib/commerce/pricing";
import { ExternalLink, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/credits");

  const { id } = await params;
  const reservationId = parseInt(id, 10);
  if (isNaN(reservationId)) notFound();

  const reservation = await getReservation(reservationId, session.user.id);
  if (!reservation) notFound();

  const balance = await getCreditBalance(session.user.id);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <div className="flex items-center gap-3 text-emerald-400">
        <CheckCircle2 className="h-8 w-8" />
        <h1 className="text-2xl font-bold text-zinc-50">Record reserved</h1>
      </div>

      <Card>
        <CardTitle>{reservation.title}</CardTitle>
        <CardDescription className="mt-1">{reservation.artist}</CardDescription>
        <p className="mt-4 text-sm text-zinc-400">
          Spent {formatCredits(reservation.creditsSpent)} · Remaining balance:{" "}
          {formatCredits(balance)}
        </p>
      </Card>

      <p className="text-sm text-zinc-400">
        Your credits reserve this pick in our concierge queue. Complete the
        physical purchase on Discogs when you are ready — we have saved this
        listing for you.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href={reservation.discogsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex"
        >
          <Button className="w-full gap-2 sm:w-auto">
            <ExternalLink className="h-4 w-4" />
            Complete purchase on Discogs
          </Button>
        </a>
        <Link href="/discover">
          <Button variant="outline" className="w-full sm:w-auto">
            Back to Discover
          </Button>
        </Link>
      </div>
    </div>
  );
}
