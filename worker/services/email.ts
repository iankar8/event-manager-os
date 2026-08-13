/**
 * Real email delivery through an organizer-supplied provider.
 *
 * The application never ships with credentials of its own. Every message is
 * written to the outbox first — that row is the receipt and it survives whether
 * or not delivery is attempted. When an event has a provider connected, the
 * outbox row is then delivered and its status moves to 'delivered' (with the
 * provider's message id) or 'failed'. Without a provider, rows stay 'sent',
 * which the UI presents as logged-to-outbox.
 */

export type EmailProvider = {
  provider: "resend";
  from_address: string;
  api_key: string;
};

export async function getEmailProvider(db: D1Database, eventId: string): Promise<EmailProvider | null> {
  return await db.prepare("SELECT provider, from_address, api_key FROM event_email_providers WHERE event_id = ?")
    .bind(eventId).first<EmailProvider>();
}

/** Last four characters only; enough to recognize a key, never enough to use one. */
export function maskKey(key: string) {
  return `····${key.slice(-4)}`;
}

const icalEscape = (value: unknown) =>
  String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
const icalStamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * A calendar file of one speaker's published, approved sessions. Returns null
 * when they have none — an empty calendar attachment would imply a schedule
 * that does not exist.
 */
export async function speakerScheduleIcs(db: D1Database, eventId: string, speakerId: string): Promise<string | null> {
  const rows = await db.prepare(
    `SELECT sessions.id, sessions.title, sessions.description, schedule_items.starts_at, schedule_items.ends_at,
            rooms.name AS room_name, events.name AS event_name
     FROM schedule_items
     JOIN schedule_revisions ON schedule_revisions.id = schedule_items.revision_id
     JOIN sessions ON sessions.id = schedule_items.session_id
     JOIN session_participants ON session_participants.session_id = sessions.id
     JOIN rooms ON rooms.id = schedule_items.room_id
     JOIN events ON events.id = sessions.event_id
     WHERE schedule_revisions.event_id = ? AND schedule_revisions.status = 'published'
       AND sessions.content_status = 'approved' AND session_participants.user_id = ?
     ORDER BY schedule_items.starts_at`,
  ).bind(eventId, speakerId).all<Record<string, string>>();
  if (!rows.results.length) return null;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Event Manager OS//Speaker Schedule//EN",
    `X-WR-CALNAME:${icalEscape(rows.results[0].event_name)}`];
  for (const row of rows.results) {
    lines.push("BEGIN:VEVENT", `UID:${row.id}@eventmanageros`, `DTSTART:${icalStamp(row.starts_at)}`,
      `DTEND:${icalStamp(row.ends_at)}`, `SUMMARY:${icalEscape(row.title)}`, `LOCATION:${icalEscape(row.room_name)}`,
      `DESCRIPTION:${icalEscape(row.description)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

async function sendViaResend(
  config: EmailProvider,
  message: { to: string; subject: string; body: string; icsContent?: string | null },
): Promise<string> {
  const payload: Record<string, unknown> = {
    from: config.from_address,
    to: [message.to],
    subject: message.subject,
    text: message.body,
  };
  if (message.icsContent) {
    payload.attachments = [{ filename: "sessions.ics", content: btoa(unescape(encodeURIComponent(message.icsContent))) }];
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.api_key}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Resend accepted the message but returned no id.");
  return result.id;
}

/**
 * Attempt delivery of an outbox row and record the truth of what happened.
 * Never throws: a delivery failure must not fail the action that queued the
 * message, and the outbox row already stands as the record either way.
 */
export async function deliverCommunication(
  db: D1Database,
  config: EmailProvider,
  communicationId: string,
  message: { to: string; subject: string; body: string; icsContent?: string | null },
): Promise<"delivered" | "failed"> {
  try {
    const providerMessageId = await sendViaResend(config, message);
    await db.prepare(
      "UPDATE communications SET status = 'delivered', provider_message_id = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(providerMessageId, communicationId).run();
    return "delivered";
  } catch {
    await db.prepare("UPDATE communications SET status = 'failed' WHERE id = ?").bind(communicationId).run();
    return "failed";
  }
}
