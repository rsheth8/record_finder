/** This app has no role/permission system — `ADMIN_EMAIL` is the entire
 * access-control mechanism for internal-only surfaces (currently just the
 * metrics dashboard at /dashboard). Unset means nobody gets in, not "anyone
 * gets in" — a missing env var should fail closed. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}
