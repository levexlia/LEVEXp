/**
 * What the activity screen (spec №2, «Начать») offers for a mission. Pure, read from the title only:
 * «… 20 мин» → an optional countdown, «… 10 страниц» → a page counter, anything else → a stopwatch.
 * None of them is required to mark the mission: self-report stays as decided (C / R-XP-2).
 */
export type ActivityAid =
  | { kind: "timer"; minutes: number }
  | { kind: "pages"; pages: number }
  | { kind: "stopwatch" };

export function activityAid(title: string): ActivityAid {
  const minutes = /(\d{1,3})\s*(?:мин|min)/iu.exec(title);
  if (minutes) {
    const value = Number(minutes[1]);
    if (value >= 1 && value <= 240) return { kind: "timer", minutes: value };
  }
  const pages = /(\d{1,4})\s*(?:стр|pages?)/iu.exec(title);
  if (pages) {
    const value = Number(pages[1]);
    if (value >= 1 && value <= 2000) return { kind: "pages", pages: value };
  }
  return { kind: "stopwatch" };
}

/** `MM:SS` (or `H:MM:SS` from one hour). */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
