import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getTasteProfileFromDb,
  saveTasteProfileToDb,
} from "@/lib/db/queries";
import type { TasteProfileData } from "@/lib/types";

const COOKIE_NAME = "taste_profile";

type TasteProfilePayload = {
  genres: TasteProfileData["genres"];
  decades: TasteProfileData["decades"];
  moods: TasteProfileData["moods"];
  albumPreference: TasteProfileData["albumPreference"];
  deepCutLevel: number;
  completedAt: string | null;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to store taste profile data");
  }
  return new TextEncoder().encode(secret);
}

function toProfile(payload: TasteProfilePayload): TasteProfileData {
  return {
    genres: payload.genres,
    decades: payload.decades,
    moods: payload.moods,
    albumPreference: payload.albumPreference,
    deepCutLevel: payload.deepCutLevel,
    completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
  };
}

function toPayload(profile: TasteProfileData): TasteProfilePayload {
  return {
    genres: profile.genres,
    decades: profile.decades,
    moods: profile.moods,
    albumPreference: profile.albumPreference,
    deepCutLevel: profile.deepCutLevel,
    completedAt: profile.completedAt?.toISOString() ?? null,
  };
}

async function readTasteProfileCookie(): Promise<TasteProfileData | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return toProfile(payload as TasteProfilePayload);
  } catch {
    return null;
  }
}

async function createTasteProfileCookie(profile: TasteProfileData): Promise<string> {
  return new SignJWT(toPayload(profile))
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(getSecret());
}

export async function getTasteProfile(): Promise<TasteProfileData | null> {
  const fromCookie = await readTasteProfileCookie();
  if (fromCookie) return fromCookie;
  return getTasteProfileFromDb();
}

export async function saveTasteProfile(
  data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean },
): Promise<TasteProfileData | null> {
  saveTasteProfileToDb(data);
  return getTasteProfileFromDb();
}

export async function attachTasteProfileCookie(
  response: NextResponse,
  profile: TasteProfileData | null,
) {
  if (!profile) return response;

  const token = await createTasteProfileCookie(profile);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
