/**
 * Blocked email addresses and domains.
 * Users with these emails/domains will be prevented from checking out or registering.
 */

// Exact email addresses to block (lowercase)
const BLOCKED_EMAILS: string[] = [
  // "spammer@example.com",
];

// Entire domains to block (lowercase, without @)
const BLOCKED_DOMAINS: string[] = [
  // "spamdomain.com",
];

/**
 * Check if an email is blocked.
 * Returns true if the email or its domain is in the blocklist.
 */
export function isEmailBlocked(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  if (BLOCKED_EMAILS.includes(normalized)) return true;

  const domain = normalized.split("@")[1];
  if (domain && BLOCKED_DOMAINS.includes(domain)) return true;

  return false;
}
