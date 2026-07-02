"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditsNavLink() {
  const { data: session } = useSession();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    fetch("/api/credits/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.balance !== undefined) setBalance(data.balance);
      })
      .catch(() => setBalance(null));
  }, [session?.user]);

  const displayBalance = session?.user ? balance : null;

  return (
    <Link
      href="/credits"
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
        "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
      )}
    >
      <Coins className="h-4 w-4" />
      <span className="hidden sm:inline">
        {displayBalance !== null ? `${displayBalance} cr` : "Credits"}
      </span>
    </Link>
  );
}
