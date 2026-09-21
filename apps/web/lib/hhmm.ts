/**
 * Client-side HH:MM normalize for sending-window inputs.
 * `<input type="time">` may emit `H:MM` or `HH:MM:SS`; campaign create still
 * validates `HH:MM` until the schema coerce lands.
 * Unparseable values are returned unchanged so the field error can name them.
 */
export function normalizeHhMm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return trimmed;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 23 || mm > 59) return trimmed;
  return `${String(hh).padStart(2, "0")}:${match[2]}`;
}
