"use client";

import Image from "next/image";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PosterCard({
  rec,
  className,
}: {
  rec: Recommendation;
  className?: string;
}) {
  return (
    <Link
      href={`/album/${rec.discogsReleaseId}`}
      className={cn(
        "group relative block shrink-0 select-none overflow-hidden rounded-md bg-zinc-900 shadow-lg",
        "origin-center transition-[transform,box-shadow] duration-300 ease-out",
        "hover:z-20 hover:scale-[1.08] hover:shadow-2xl hover:shadow-violet-950/40",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
        className,
      )}
      draggable={false}
    >
      <div className="relative aspect-[2/3] w-full">
        {rec.coverUrl ? (
          <Image
            src={rec.coverUrl}
            alt={`${rec.title} cover`}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
            sizes="(max-width: 640px) 132px, 188px"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">
            No art
          </div>
        )}
        <div className="absolute inset-0 rounded-md ring-1 ring-inset ring-white/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-90" />
        <div className="absolute inset-x-0 bottom-0 translate-y-1 p-3 transition-transform duration-300 group-hover:translate-y-0">
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
            {rec.title}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-300">
            {rec.artist}
            {rec.year ? ` · ${rec.year}` : ""}
          </p>
          {rec.reasons[0] && (
            <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-zinc-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {rec.reasons[0]}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
