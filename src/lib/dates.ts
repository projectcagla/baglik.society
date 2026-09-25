// All club times are Europe/Istanbul. Stored as timestamptz (UTC) in Postgres;
// formatted here with Intl so DST rules (none since 2016, but still) come from
// the platform's tz database, not from a hard-coded offset.
export const TZ = 'Europe/Istanbul';

function parts(date: Date, opts: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts }).formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

/** "27 eylül 2026" */
export function formatDay(date: Date): string {
  const p = parts(date, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${p.day} ${p.month!.toLocaleLowerCase('tr')} ${p.year}`;
}

/** "pazar" */
export function formatWeekday(date: Date): string {
  return parts(date, { weekday: 'long' }).weekday!.toLocaleLowerCase('tr');
}

/** "19.30" — Turkish style, 24 h */
export function formatTime(date: Date): string {
  const p = parts(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}.${p.minute}`;
}

/** "27 eylül 2026 · pazar · 19.30" */
export function formatEventDate(date: Date): string {
  return `${formatDay(date)} · ${formatWeekday(date)} · ${formatTime(date)}`;
}

/** "27.09.2026 19.30" for compact admin tables */
export function formatShort(date: Date): string {
  const p = parts(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.day}.${p.month}.${p.year} ${p.hour}.${p.minute}`;
}

/** Offset of Istanbul from UTC at a given instant, in minutes. */
function offsetMinutes(at: Date): number {
  const p = parts(at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-09-27T19:30" (as typed in Istanbul) → the UTC instant. */
export function istanbulLocalToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const naive = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let guess = new Date(naive - offsetMinutes(new Date(naive)) * 60000);
  guess = new Date(naive - offsetMinutes(guess) * 60000);
  return Number.isNaN(guess.getTime()) ? null : guess;
}

/** UTC instant → "2026-09-27T19:30" for <input type="datetime-local">. */
export function dateToIstanbulLocal(date: Date | null | undefined): string {
  if (!date) return '';
  const p = parts(date, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Same calendar day in Istanbul? */
export function isSameIstanbulDay(a: Date, b: Date): boolean {
  return formatDay(a) === formatDay(b);
}

/** Whole calendar days between two instants, counted in Istanbul. */
export function istanbulDayDiff(from: Date, to: Date): number {
  const day = (d: Date) => {
    const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!);
  };
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** "bugün", "yarın", "3 gün sonra", "geçti" */
export function relativeDay(target: Date, now = new Date()): string {
  const d = istanbulDayDiff(now, target);
  if (d < 0) return 'geçti';
  if (d === 0) return 'bugün';
  if (d === 1) return 'yarın';
  return `${d} gün sonra`;
}

/** Request-time clock for server components (kept out of render bodies). */
export function nowMs(): number {
  return Date.now();
}

export function isPast(d: Date | null | undefined): boolean {
  return !!d && d.getTime() < Date.now();
}
