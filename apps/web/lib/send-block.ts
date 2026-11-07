/**
 * "Why isn't this campaign sending?" in one line. Pure and client-safe.
 *
 * The engine stores its latest reason on campaigns.send_block_reason (see
 * SEND_BLOCK_REASONS in packages/email-engine/src/scheduler.ts). Expected
 * waits (sending hours, daily limit) read neutral; things someone must fix
 * read as a warning with a link.
 */
import { minutesSinceMidnight, parseTimeToMinutes, zonedParts } from "@smartreach/shared";
import { POSTAL_SETTINGS_HREF, isSendingStatus } from "./postal-hold-policy";

export interface SendBlockView {
  tone: "neutral" | "warning";
  message: string;
  href?: string;
  actionLabel?: string;
}

export interface SendBlockCampaign {
  id: string;
  status: string;
  sendBlockReason: string | null | undefined;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  sendingTimezone: string;
  businessDaysOnly: boolean;
}

const SUPPORT_HREF = "/support";

/** " on Monday" / " tomorrow" / "" for the next start of the sending window. */
function nextSendSuffix(c: SendBlockCampaign, now: Date): string {
  const tz = c.sendingTimezone || "UTC";
  let weekday: number;
  let mins: number;
  try {
    weekday = zonedParts(now, tz).weekday;
    mins = minutesSinceMidnight(now, tz);
  } catch {
    return "";
  }
  const start = parseTimeToMinutes(c.sendingWindowStart || "00:00");
  const end = parseTimeToMinutes(c.sendingWindowEnd || "00:00");
  // An overnight window (start > end) reopens later today.
  const endedToday = start < end && mins >= end;
  if (c.businessDaysOnly) {
    if (weekday === 6 || weekday === 0) return " on Monday";
    if (weekday === 5 && endedToday) return " on Monday";
  }
  return endedToday ? " tomorrow" : "";
}

export function describeSendBlock(
  c: SendBlockCampaign,
  now: Date = new Date(),
  opts: { skipPostal?: boolean } = {},
): SendBlockView | null {
  if (!isSendingStatus(c.status)) return null;
  switch (c.sendBlockReason) {
    case "outside-window":
      return {
        tone: "neutral",
        message: `Waiting for sending hours. Next send around ${c.sendingWindowStart} ${c.sendingTimezone}${nextSendSuffix(c, now)}.`,
      };
    case "daily-limit":
      return { tone: "neutral", message: "Daily limit reached. Sending resumes tomorrow." };
    case "pool-share-used":
      return {
        tone: "neutral",
        message: "Today's share of the shared mailboxes is used. More emails go out as capacity frees up, or tomorrow.",
      };
    case "senders-exhausted":
      return {
        tone: "neutral",
        message: "Every mailbox on this campaign has reached today's limit. Sending resumes tomorrow.",
      };
    case "all-paused":
      return {
        tone: "warning",
        message:
          "The mailboxes for this campaign are paused, so nothing is sending. AutoGTM manages the mailboxes: contact support if this lasts.",
        href: SUPPORT_HREF,
        actionLabel: "Contact support",
      };
    case "no-senders":
      return {
        tone: "warning",
        message: "This campaign has no mailboxes to send from.",
        href: SUPPORT_HREF,
        actionLabel: "Contact support",
      };
    case "owner-not-approved":
      return {
        tone: "warning",
        message: "Sending is paused by AutoGTM. Contact support to turn it back on.",
        href: SUPPORT_HREF,
        actionLabel: "Contact support",
      };
    case "missing-postal-address":
      if (opts.skipPostal) return null;
      return {
        tone: "warning",
        message: "Held: add your business postal address.",
        href: POSTAL_SETTINGS_HREF,
        actionLabel: "Settings → Compliance",
      };
    case "missing-list":
      return { tone: "warning", message: "This campaign has no lead list, so there is no one to email." };
    case "missing-list-or-template":
      return {
        tone: "warning",
        message: "This campaign has no email to send. Add a step to its sequence.",
        href: `/campaigns/${c.id}?tab=sequence`,
        actionLabel: "Open sequence",
      };
    default:
      return null;
  }
}
