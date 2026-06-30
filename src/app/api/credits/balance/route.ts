import { auth } from "@/lib/auth";
import { getCreditsForUser } from "@/lib/commerce/credits-service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const balance = await getCreditsForUser(
    session.user.id,
    session.user.email,
  );

  return NextResponse.json({ balance });
}
