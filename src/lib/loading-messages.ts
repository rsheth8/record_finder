export const LOADING_MESSAGES = {
  discover: [
    "Dropping the needle...",
    "Digging through the crates...",
    "Hunting for vinyl pressings...",
    "Cross-referencing Discogs...",
    "Curating your next spin...",
  ],
  quiz: [
    "Saving your taste profile...",
    "Warming up the turntable...",
    "Cueing up your picks...",
    "Almost ready to spin...",
  ],
  spotify: [
    "Reading your rotation...",
    "Scanning top artists...",
    "Syncing your listening history...",
  ],
  general: [
    "Loading...",
    "Just a sec...",
  ],
} as const;

export type LoadingContext = keyof typeof LOADING_MESSAGES;
