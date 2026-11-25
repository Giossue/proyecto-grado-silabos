import { formatDateDisplay } from '@/lib/dateDisplay';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export const relativeTime = (value: string, now: Date = new Date()): string => {
  const date = new Date(value);
  const elapsed = Math.max(0, now.getTime() - date.getTime());

  if (elapsed < MINUTE) return 'ahora';
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < WEEK) {
    const days = Math.floor(elapsed / DAY);
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  if (elapsed < 5 * WEEK) return `hace ${Math.floor(elapsed / WEEK)} sem`;

  return formatDateDisplay(value, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
};
