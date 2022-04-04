export function minutesInSeconds(minutes: number) {
  return Math.round(new Date().getTime() / 1000) + minutes * 60;
}
