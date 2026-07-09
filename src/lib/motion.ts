export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

/** Tighter stagger for dense grids (search results, discover grid) — the
 * default 0.1s per child reads as sluggish past ~6 items. */
export const staggerGrid = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const spring = { type: "spring" as const, stiffness: 260, damping: 24 };

export const posterHover = {
  rest: { scale: 1, rotateY: 0 },
  hover: { scale: 1.05, rotateY: 2, transition: spring },
};
