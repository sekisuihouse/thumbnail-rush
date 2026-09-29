export const BASE_POINTS = 100;
export const REMAINING_SECOND_MULTIPLIER = 0.5;

export function calculateScore(roundSeconds: number, elapsedMs: number): number {
  const remainingSeconds = Math.max(0, roundSeconds - elapsedMs / 1000);
  return Math.round(BASE_POINTS + remainingSeconds * REMAINING_SECOND_MULTIPLIER);
}
