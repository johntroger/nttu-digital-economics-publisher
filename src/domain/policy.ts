export const POLICY = Object.freeze({
  timeZone: 'Asia/Ho_Chi_Minh',
  publishTime: '10:00',
  historyCheckTime: '08:00',
  ownerEmail: 'tranthanhtung37@gmail.com',
  programDurationYears: 3.5,
  programCohort: 2026,
  maxPublishAttempts: 3,
  retryDelayMinutes: 5,
  lowStockThreshold: 3,
  initialScheduledPosts: 30,
  initialReservePosts: 10,
});

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: POLICY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function businessDate(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid instant');
  const parts = dateFormatter.formatToParts(instant);
  const part = (kind: string) => parts.find(value => value.type === kind)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function scheduledInstant(date: string, time: string = POLICY.publishTime): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid schedule date/time');
  }
  const midnight = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid calendar date');
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || hours > 23 || minutes > 59) {
    throw new Error('Invalid schedule time');
  }
  // Vietnam uses UTC+07 for the program's 2026 scheduling horizon.
  return new Date(midnight.getTime() + (hours * 60 + minutes - 7 * 60) * 60_000);
}
