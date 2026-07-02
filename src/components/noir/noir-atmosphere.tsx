"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { useTheme } from "@/components/theme-provider";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const NoirScene = dynamic(
  () => import("@/components/noir/noir-scene").then((m) => m.NoirScene),
  { ssr: false },
);

export function NoirAtmosphere() {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);

  const isNoir = theme === "record-store-noir";

  useEffect(() => {
    if (!isNoir || reducedMotion) return;

    const orbs = [orb1Ref.current, orb2Ref.current, orb3Ref.current].filter(Boolean);
    const tweens = orbs.map((orb, i) =>
      gsap.to(orb, {
        x: `+=${(i % 2 === 0 ? 1 : -1) * 40}`,
        y: `+=${(i % 2 === 0 ? -1 : 1) * 30}`,
        duration: 8 + i * 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      }),
    );

    return () => tweens.forEach((t) => t.kill());
  }, [isNoir, reducedMotion]);

  if (!isNoir) return null;

  return (
    <div className="noir-atmosphere" aria-hidden>
      {!reducedMotion && (
        <div className="noir-atmosphere__canvas">
          <NoirScene />
        </div>
      )}

      <div
        ref={orb1Ref}
        className="noir-orb noir-orb--primary"
        style={{ top: "10%", left: "15%" }}
      />
      <div
        ref={orb2Ref}
        className="noir-orb noir-orb--secondary"
        style={{ top: "55%", right: "10%" }}
      />
      <div
        ref={orb3Ref}
        className="noir-orb noir-orb--warm"
        style={{ bottom: "15%", left: "35%" }}
      />

      <div className="noir-atmosphere__grain ambient-bg ambient-bg--grain" />
      <div className="noir-atmosphere__vignette" />
      <div className="noir-atmosphere__floor-glow" />
    </div>
  );
}
