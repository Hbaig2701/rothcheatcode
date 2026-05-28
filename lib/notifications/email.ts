/**
 * Transactional email via Resend.
 *
 * Best-effort: if RESEND_API_KEY isn't set in the environment, every send
 * call no-ops with a console.warn (does NOT throw). That way the deploy can
 * land before the API key is provisioned, and once the key is added in
 * Vercel env, emails start flowing on the next request.
 *
 * FROM address defaults to Resend's sandbox sender (onboarding@resend.dev)
 * so the integration works the moment an API key lands. To send from
 * support@retirementexpert.ai (and avoid spam filters / look professional)
 * verify the domain in Resend dashboard and set RESEND_FROM_EMAIL in env.
 */

import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Retirement Expert Support <onboarding@resend.dev>";
// Reply-To defaults to the From address (no-op) but can be overridden in env
// to point at a real monitored mailbox. Microsoft/Outlook penalizes
// `noreply@`-style senders heavily, and absence of a distinct Reply-To
// reinforces the "automated, no engagement possible" signal that pushes
// transactional mail toward junk. Setting RESEND_REPLY_TO to e.g.
// support@retirementexpert.ai (a real receiving inbox) is one of the
// highest-leverage deliverability wins.
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO || undefined;
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.retirementexpert.ai";

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Per-send override for Reply-To. Falls back to RESEND_REPLY_TO env, then
   * to the From address (Resend's default behavior).
   */
  replyTo?: string;
}

async function sendEmail({ to, subject, html, text, replyTo }: SendArgs): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping send", { to, subject });
    return;
  }
  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      // Reply-To improves deliverability by giving recipients a real inbox
      // to reply to (vs an unmonitored noreply@ that gets bounce-looped).
      ...(replyTo || REPLY_TO_EMAIL ? { replyTo: replyTo ?? REPLY_TO_EMAIL! } : {}),
      // Headers that signal this is automated transactional mail (not bulk
      // marketing). Outlook/SmartScreen and Gmail both weight these:
      //   Auto-Submitted: auto-generated  (RFC 3834) — tells receiving
      //     servers this isn't a human-typed message; suppresses
      //     out-of-office auto-responders looping back at us.
      //   X-Auto-Response-Suppress: All  (Microsoft-specific) — same
      //     intent for the Outlook/Exchange ecosystem.
      //   Precedence: bulk  (legacy convention) — still respected by some
      //     filters and mail-list software to skip auto-replies.
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
        "Precedence": "bulk",
      },
    });
    if (error) {
      console.error("[email] Resend send failed", { to, subject, error });
    }
  } catch (err) {
    console.error("[email] Resend send threw", { to, subject, err });
  }
}

// ----------------------------------------------------------------------
// Support-ticket email templates
// ----------------------------------------------------------------------

/**
 * Escape user-supplied text so it's safe to embed inside an HTML email body.
 * Resend renders HTML directly — without this, a ticket subject containing
 * "<" or "&" would either get eaten by the parser or render malformed.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the body of a comment for inclusion in the email. Truncates long
 * replies (anything past ~1200 chars gets a "…" suffix and a "click to read
 * the rest" cue) so the email stays scannable without forcing the recipient
 * to scroll. The full comment is always available in-app via the link.
 */
function formatCommentForEmail(body: string): { html: string; text: string; wasTruncated: boolean } {
  const MAX_CHARS = 1200;
  const trimmed = body.trim();
  const wasTruncated = trimmed.length > MAX_CHARS;
  const displayText = wasTruncated ? `${trimmed.slice(0, MAX_CHARS)}…` : trimmed;
  const html = escapeHtml(displayText).replace(/\n/g, "<br>");
  return { html, text: displayText, wasTruncated };
}

interface TicketReplyEmailInput {
  to: string;
  firstName?: string | null;
  ticketId: string;
  ticketSubject: string;
  replyBody: string;
}

export async function sendTicketReplyEmail(input: TicketReplyEmailInput): Promise<void> {
  const { to, firstName, ticketId, ticketSubject, replyBody } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const link = `${APP_BASE_URL}/support/${ticketId}`;
  const subjectSafe = escapeHtml(ticketSubject);
  const comment = formatCommentForEmail(replyBody);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert · Support</p>
                <h1 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;line-height:1.4;">Support replied to your ticket</h1>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">Re: ${subjectSafe}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <div style="margin:0 0 20px 0;padding:14px 16px;background:#f9fafb;border-left:3px solid #d4af37;border-radius:6px;font-size:14px;color:#111827;line-height:1.55;">${comment.html}${
    comment.wasTruncated
      ? `<p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;">(reply continues — click below to view the full message)</p>`
      : ""
  }</div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${link}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View ticket</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">You're receiving this because you filed a support ticket. Replies to this email aren't monitored — please respond inside the ticket so it stays threaded.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

The Retirement Expert support team replied to your ticket.

Re: ${ticketSubject}

---
${comment.text}
---

View the full ticket: ${link}

Replies to this email aren't monitored — please respond inside the ticket so the conversation stays threaded.

— Retirement Expert Support`;

  await sendEmail({
    to,
    // Drop the "Re:" prefix — Outlook/SmartScreen treats fake replies
    // (no matching Message-ID in the recipient's history) as a spam
    // signal. "Support replied" reads as legitimate transactional copy.
    subject: `Support replied: ${ticketSubject}`,
    html,
    text,
  });
}

// ----------------------------------------------------------------------
// Welcome (account creation)
// ----------------------------------------------------------------------

interface WelcomeEmailInput {
  to: string;
  firstName?: string | null;
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const { to, firstName } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const loginLink = `${APP_BASE_URL}/login`;
  const dashboardLink = `${APP_BASE_URL}/dashboard`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert</p>
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">Welcome aboard 👋</h1>
                <p style="margin:0 0 20px 0;font-size:14px;color:#374151;">Your account is ready.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">Thanks for signing up. You can log in any time at the link below — bookmark it so you can find your way back.</p>
                <p style="margin:0 0 6px 0;font-size:13px;color:#6b7280;">Quick start, in order:</p>
                <ol style="margin:0 0 22px 18px;padding:0;font-size:14px;color:#374151;line-height:1.7;">
                  <li>Add a client (or send them an intake link)</li>
                  <li>Run a Roth conversion scenario</li>
                  <li>Export the PDF and walk them through it</li>
                </ol>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${loginLink}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Log in</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">Need a hand? Hit the Support button inside the app — we usually reply within a few hours. Or just reply to <em>that</em> ticket inside the app once it's open (replies to this email aren't monitored).</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

Thanks for signing up — your account is ready.

Log in: ${loginLink}
Dashboard: ${dashboardLink}

Quick start:
  1. Add a client (or send them an intake link)
  2. Run a Roth conversion scenario
  3. Export the PDF and walk them through it

Need a hand? Use the Support button inside the app — we usually reply within a few hours.

— Retirement Expert`;

  await sendEmail({
    to,
    subject: "Welcome to Retirement Expert",
    html,
    text,
  });
}

// ----------------------------------------------------------------------
// Signup continuation (recovery email for users who paid but didn't
// complete the /welcome form — e.g. closed the tab after Stripe redirect)
// ----------------------------------------------------------------------

interface SignupContinuationEmailInput {
  to: string;
  sessionId: string;
  firstName?: string | null;
}

export async function sendSignupContinuationEmail(input: SignupContinuationEmailInput): Promise<void> {
  const { to, sessionId, firstName } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const link = `${APP_BASE_URL}/welcome?session_id=${encodeURIComponent(sessionId)}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert</p>
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">Finish setting up your account</h1>
                <p style="margin:0 0 20px 0;font-size:14px;color:#374151;">Your payment was successful — one quick step left.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">Thanks for subscribing. We just need you to set a password so we can finish creating your account. Click the button below and you'll be in within seconds.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${link}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Continue setup</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">This link is tied to your payment and only works for the email you used to subscribe. If you've already finished setting up your account, just log in at <a href="${APP_BASE_URL}/login" style="color:#9ca3af;">${APP_BASE_URL}/login</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

Your payment was successful — one quick step left to finish creating your account.

Continue setup: ${link}

This link is tied to your payment. If you've already finished setting up your account, just log in at ${APP_BASE_URL}/login.

— Retirement Expert`;

  await sendEmail({
    to,
    subject: "Finish setting up your Retirement Expert account",
    html,
    text,
  });
}

// ----------------------------------------------------------------------
// Ticket-submitted confirmation (advisor's receipt)
// ----------------------------------------------------------------------

interface TicketSubmittedEmailInput {
  to: string;
  firstName?: string | null;
  ticketId: string;
  ticketSubject: string;
  severity: string;
}

export async function sendTicketSubmittedEmail(input: TicketSubmittedEmailInput): Promise<void> {
  const { to, firstName, ticketId, ticketSubject, severity } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const link = `${APP_BASE_URL}/support/${ticketId}`;
  const subjectSafe = escapeHtml(ticketSubject);
  const severitySafe = escapeHtml(severity);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert · Support</p>
                <h1 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;line-height:1.4;">We got your ticket ✓</h1>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">Re: ${subjectSafe}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">Your ticket is logged and the support team will get back to you shortly. We aim to respond to most tickets within a few business hours; high-severity reports are prioritized.</p>
                <div style="margin:0 0 20px 0;padding:12px 16px;background:#f9fafb;border-radius:6px;font-size:13px;color:#6b7280;">
                  Severity: <strong style="color:#111827;text-transform:capitalize;">${severitySafe}</strong>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${link}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View ticket</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">You'll get an email when we reply. Replies to this email aren't monitored — please respond inside the ticket so the conversation stays threaded.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

We got your ticket — the support team will get back to you shortly.

Re: ${ticketSubject}
Severity: ${severity}

View the ticket: ${link}

You'll get an email when we reply. Please respond inside the ticket so the conversation stays threaded — replies to this email aren't monitored.

— Retirement Expert Support`;

  await sendEmail({
    to,
    subject: `We got your ticket — ${ticketSubject}`,
    html,
    text,
  });
}

// ----------------------------------------------------------------------
// Intake completed (client finished questionnaire)
// ----------------------------------------------------------------------

interface IntakeCompletedEmailInput {
  to: string;
  firstName?: string | null;
  clientId: string;
  clientName?: string | null;
}

export async function sendIntakeCompletedEmail(input: IntakeCompletedEmailInput): Promise<void> {
  const { to, firstName, clientId, clientName } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const link = `${APP_BASE_URL}/clients/${clientId}/results`;
  const clientLabel = clientName ? escapeHtml(clientName) : "Your client";
  const headline = clientName
    ? `${escapeHtml(clientName)} just finished their intake`
    : "A new client just finished their intake";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert</p>
                <h1 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;line-height:1.4;">${headline}</h1>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">Their information is in your account, ready for analysis.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">${clientLabel} submitted the questionnaire — open their record to review the details and run the first scenario.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${link}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Open client</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">Tip: run a baseline scenario first to anchor the comparison, then layer the Roth conversion strategy on top.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

${clientName ? `${clientName} just finished their intake` : "A new client just finished their intake"}.
Their information is in your account, ready for analysis.

Open client: ${link}

Tip: run a baseline scenario first, then layer the Roth conversion strategy on top.

— Retirement Expert`;

  await sendEmail({
    to,
    subject: clientName
      ? `New intake submission: ${clientName}`
      : "New client questionnaire submitted",
    html,
    text,
  });
}

// ----------------------------------------------------------------------
// Status-change template (existing — kept below for grouping)
// ----------------------------------------------------------------------

interface TicketStatusEmailInput {
  to: string;
  firstName?: string | null;
  ticketId: string;
  ticketSubject: string;
  newStatus: string;       // raw enum (open|in_progress|waiting_on_user|resolved|closed)
  newStatusLabel: string;  // pre-formatted human label
}

export async function sendTicketStatusChangeEmail(input: TicketStatusEmailInput): Promise<void> {
  const { to, firstName, ticketId, ticketSubject, newStatus, newStatusLabel } = input;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const link = `${APP_BASE_URL}/support/${ticketId}`;
  const subjectSafe = escapeHtml(ticketSubject);
  const statusSafe = escapeHtml(newStatusLabel);

  // Status-specific framing — "waiting_on_user" needs a stronger call to
  // action (the advisor must do something) than "resolved" (which is a
  // confirmation).
  const isWaiting = newStatus === "waiting_on_user";
  const isResolved = newStatus === "resolved" || newStatus === "closed";
  const headline = isWaiting
    ? "We need a quick response from you"
    : isResolved
    ? `Your ticket is ${statusSafe.toLowerCase()}`
    : `Your ticket status was updated to ${statusSafe}`;
  const bodyCopy = isWaiting
    ? "We've replied with a question or asked for more info — please pop back into the ticket and respond so we can keep moving."
    : isResolved
    ? "If you're still seeing the issue or have a follow-up question, open the ticket and reply — it'll re-open automatically."
    : "Hop into the ticket to see the latest update from the support team.";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 12px 0;font-size:14px;color:#6b7280;">Retirement Expert · Support</p>
                <h1 style="margin:0 0 8px 0;font-size:18px;font-weight:600;color:#111827;line-height:1.4;">${escapeHtml(headline)}</h1>
                <p style="margin:0 0 18px 0;font-size:14px;color:#374151;">Re: ${subjectSafe}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.55;">${escapeHtml(bodyCopy)}</p>
                <div style="margin:0 0 20px 0;padding:12px 16px;background:#f9fafb;border-radius:6px;font-size:13px;color:#6b7280;">
                  New status: <strong style="color:#111827;">${statusSafe}</strong>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 28px 28px;" align="left">
                <a href="${link}" style="display:inline-block;padding:11px 22px;background:#d4af37;color:#1a1a1a;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View ticket</a>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">You're receiving this because you filed a support ticket. Replies to this email aren't monitored — please respond inside the ticket so it stays threaded.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

${headline}

Re: ${ticketSubject}
New status: ${newStatusLabel}

${bodyCopy}

View the ticket: ${link}

— Retirement Expert Support`;

  await sendEmail({
    to,
    subject: isWaiting
      ? `Action needed — ${ticketSubject}`
      : isResolved
      ? `Resolved — ${ticketSubject}`
      : `Update — ${ticketSubject}`,
    html,
    text,
  });
}
