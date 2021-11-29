export const SECONDS_PER_MONTH = 2629743;
const SECONDS_PER_DAY = 86400;

export function nowInSeconds(): number {
  return Math.round(new Date().getTime() / 1000);
}

export function monthsInSeconds(m: number): number {
  return Math.round(nowInSeconds() + SECONDS_PER_MONTH * m);
}

export function daysInSeconds(d: number): number {
  return Math.round(nowInSeconds() + SECONDS_PER_DAY * d);
}
