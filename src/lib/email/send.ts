import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/** Thin I/O wrapper around Resend — the only untested boundary in the
 * price-drop-alert pipeline (see price-drop-alert.ts for the testable
 * template logic). A missing RESEND_API_KEY logs and no-ops rather than
 * throwing, so one unset env var doesn't take down the whole cron run —
 * price snapshotting should still complete even if alerting can't. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      "[email] RESEND_API_KEY is not set — skipping send. " +
        "Create a key at https://resend.com/api-keys and add it to .env.local.",
    );
    return false;
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return true;
  } catch (error) {
    console.error("[email] send failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
