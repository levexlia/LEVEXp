import { energyForDay, grantedXp, streakDays } from "@levex/domain";
import { currentTime, listGoals, todayAwards, type PlayerView } from "./store.js";

export type PlayerAnswer = PlayerView & {
  streak: number;
  energy: { current: number; max: number };
  /** Today's XP count by the daily rules (R-XP-6/7), player day in Asia/Jerusalem. */
  today: ReturnType<typeof todayAwards>;
};

/**
 * Every route that answers with the player sends the same shape as GET /player, streak, energy and
 * today's XP count included. They are derived from goal completions, so a client that replaces its
 * player with the answer of PUT /player/avatar or PATCH /player keeps them.
 * The streak counts every recorded completion (also without XP); energy only completions with XP (R-XP-6).
 */
export function playerView(player: PlayerView): PlayerAnswer {
  const goals = listGoals();
  const now = currentTime();
  const paid = goals.filter((goal) => grantedXp(goal) > 0).map((goal) => goal.completedAt);
  return {
    ...player,
    streak: streakDays(goals.map((goal) => goal.completedAt), now),
    energy: energyForDay(paid, now),
    today: todayAwards(),
  };
}
