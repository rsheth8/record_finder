"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

export function NoirHero({
  title,
  subtitle,
  primaryCta,
  showSecondary,
  coverUrls,
}: {
  title: string;
  subtitle: string;
  primaryCta: { href: string; label: string };
  showSecondary: boolean;
  coverUrls: string[];
}) {
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const themeLabel = THEMES.find((t) => t.id === theme)?.label ?? "Record Finder";
  const isNoir = theme === "record-store-noir";
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from(titleRef.current, { y: 60, opacity: 0, duration: 1 })
        .from(subtitleRef.current, { y: 30, opacity: 0, duration: 0.8 }, "-=0.5")
        .from(ctaRef.current?.children ?? [], { y: 20, opacity: 0, stagger: 0.12, duration: 0.6 }, "-=0.4");

      if (glowRef.current) {
        gsap.to(glowRef.current, {
          opacity: 0.7,
          scale: 1.1,
          duration: 3,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }
    }, sectionRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "relative -mx-4 overflow-hidden md:mx-0 md:rounded-2xl",
        isNoir && "noir-hero",
      )}
    >
      {coverUrls.length > 0 && (
        <div className="absolute inset-0 grid grid-cols-4 gap-1 opacity-20 md:grid-cols-6">
          {coverUrls.slice(0, 6).map((url, i) => (
            <div key={url + i} className="relative aspect-square">
              <Image src={url} alt="" fill className="object-cover blur-md sepia-[0.3]" unoptimized />
            </div>
          ))}
        </div>
      )}

      {isNoir && <div ref={glowRef} className="noir-hero__spotlight" />}

      <div className={cn("relative px-4 py-14 md:px-10 md:py-20", isNoir && "noir-hero__content")}>
        <motion.div
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-muted px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-accent"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {themeLabel}
        </motion.div>

        <h1
          ref={titleRef}
          className="font-display max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl"
        >
          {title}
        </h1>
        <p ref={subtitleRef} className="mt-5 max-w-2xl text-lg text-muted md:text-xl">
          {subtitle}
        </p>
        <div ref={ctaRef} className="mt-10 flex flex-wrap gap-4">
          <Link href={primaryCta.href}>
            <Button size="lg" className={cn("shadow-lg", isNoir && "noir-cta-glow")}>
              {primaryCta.label}
            </Button>
          </Link>
          {showSecondary && (
            <Link href="/discover">
              <Button variant="outline" size="lg" className="border-accent/40 backdrop-blur-sm">
                Browse Discover
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isNoir && <div className="noir-hero__edge-fade" />}
    </section>
  );
}
