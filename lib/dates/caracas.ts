// "Today" as a calendar day in Venezuela (America/Caracas, UTC-4, no DST). The
// server runs in UTC, so after 20:00 in Caracas `new Date()` is already tomorrow:
// every "is this date in the future / what day is it" decision made on the server
// must use this instead of the server's own clock.
export function caracasToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(now);
}
