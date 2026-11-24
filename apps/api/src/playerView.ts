import { energyForDay, streakDays } from "@levex/domain";
import { currentTime, listGoals, type PlayerView } from "./store.js";

export type PlayerAnswer = PlayerView & { streak: number; energy: { current: number; max: number } };

/**
 * Every route that answers with the player sends the same shape as GET /player, streak and energy
 * included. They are derived from goal completions, so a client that replaces its player with the
 * answer of PUT /player/avatar or PATCH /player keeps them (before, they fell back to 0 and 50/50).
 */
export function playerView(player: PlayerView): PlayerAnswer {
  const times = listGoals().map((goal) => goal.completedAt);
  const now = currentTime();
  return { ...player, streak: streakDays(times, now), energy: energyForDay(times, now) };
}

