export type FreeCreditBonus = {
  id: string;
  name: string;
  credits: number;
  description: string;
  /** once = welcome bonus, daily = once per calendar day */
  type: "once" | "daily";
};

export const FREE_CREDIT_BONUSES: FreeCreditBonus[] = [
  {
    id: "welcome",
    name: "Welcome bonus",
    credits: 200,
    description: "One-time credits when you first connect Spotify",
    type: "once",
  },
  {
    id: "daily",
    name: "Daily dig bonus",
    credits: 50,
    description: "Free credits once per day — no payment required",
    type: "daily",
  },
];

export function getFreeBonus(id: string): FreeCreditBonus | undefined {
  return FREE_CREDIT_BONUSES.find((b) => b.id === id);
}

export const WELCOME_CREDITS = 200;
export const DAILY_BONUS_CREDITS = 50;
