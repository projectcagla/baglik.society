import { describe, expect, it } from 'vitest';
import { dateToIstanbulLocal, formatEventDate, formatTime, istanbulDayDiff, istanbulLocalToDate, relativeDay } from '@/lib/dates';

const NIGHT = new Date('2026-09-27T19:30:00+03:00');

describe('Istanbul dates', () => {
  it('formats film night 002 exactly as the club writes it', () => {
    expect(formatEventDate(NIGHT)).toBe('27 eylül 2026 · pazar · 19.30');
    expect(formatTime(NIGHT)).toBe('19.30');
  });

  it('parses datetime-local input as Istanbul time', () => {
    const d = istanbulLocalToDate('2026-09-27T19:30');
    expect(d?.toISOString()).toBe('2026-09-27T16:30:00.000Z');
    expect(dateToIstanbulLocal(d)).toBe('2026-09-27T19:30');
    expect(istanbulLocalToDate('27.09.2026')).toBeNull();
  });

  it('counts days in Istanbul, not UTC', () => {
    const lateNight = new Date('2026-09-25T23:30:00+03:00'); // still 25th in Istanbul, 20:30Z
    expect(istanbulDayDiff(lateNight, NIGHT)).toBe(2);
    expect(relativeDay(NIGHT, new Date('2026-09-27T09:00:00+03:00'))).toBe('bugün');
    expect(relativeDay(NIGHT, new Date('2026-09-26T09:00:00+03:00'))).toBe('yarın');
    expect(relativeDay(NIGHT, new Date('2026-09-28T09:00:00+03:00'))).toBe('geçti');
  });
});
