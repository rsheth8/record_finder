export const THEME_IDS = [
  "midnight-wax",
  "record-store-noir",
  "analog-warmth",
  "neon-crate",
  "hifi-minimal",
  "jazz-club",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "record-store-noir";

export const THEME_STORAGE_KEY = "record-finder-theme";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "midnight-wax",
    label: "Midnight Wax",
    description: "Cinematic violet on deep zinc — refined vinyl nights",
    swatches: ["#09090b", "#8b5cf6", "#18181b"],
  },
  {
    id: "record-store-noir",
    label: "Record Store Noir",
    description: "Warm amber glow in a dim record shop",
    swatches: ["#0c0a09", "#f59e0b", "#1c1917"],
  },
  {
    id: "analog-warmth",
    label: "Analog Warmth",
    description: "Cream and burnt orange — 70s hi-fi lounge",
    swatches: ["#faf7f2", "#c2410c", "#f0ebe3"],
  },
  {
    id: "neon-crate",
    label: "Neon Crate-Digger",
    description: "Electric cyan and fuchsia — late-night city dig",
    swatches: ["#0a0a0f", "#22d3ee", "#e879f9"],
  },
  {
    id: "hifi-minimal",
    label: "Hi-Fi Minimal",
    description: "Pure black and white — album art is the color",
    swatches: ["#000000", "#ffffff", "#262626"],
  },
  {
    id: "jazz-club",
    label: "Jazz Club",
    description: "Deep wine and champagne gold — velvet sophistication",
    swatches: ["#1a0a0f", "#d4a574", "#2d1219"],
  },
];

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}
