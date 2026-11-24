/**
 * Assistant hints (scene17 «Помощник»): a calm bubble next to the map robot.
 *
 * - Two triggers: an empty day (`empty_day`) and own missions 3/3 with XP today (`own_cap`).
 * - At most once per player day (Asia/Jerusalem) per trigger: localStorage `levex.hint.<id>` = the day it
 *   was shown. It stays while its reason lasts in this session; × hides it until the next player day.
 * - No sound, no push, no countdown, no red.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { playerDay } from "@levex/domain";

export const HINT_IDS = ["own_cap", "empty_day"] as const;
export type HintId = (typeof HINT_IDS)[number];

export const HINT_KEY = (id: HintId) => `levex.hint.${id}`;

export const HINT_TEXT = {
  emptyDayRepeat: "Можно повторить миссию из плана дня.",
  emptyDayNew: "Можно взять миссию из плана дня.",
  ownCap: "Свои миссии с XP на сегодня есть. Дальше они запишутся без XP.",
} as const;

/** Width of the bubble (scene17: 206 px for the map text, 256 px for the longer «3/3» text). */
export const HINT_WIDTH: Record<HintId, number> = { empty_day: 206, own_cap: 256 };

export type HintStore = Pick<Storage, "getItem" | "setItem">;

function storage(): HintStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(store: HintStore | null, id: HintId): string | null {
  try {
    return store?.getItem(HINT_KEY(id)) ?? null;
  } catch {
    return null;
  }
}

function write(store: HintStore | null, id: HintId, day: string): void {
  try {
    store?.setItem(HINT_KEY(id), day);
  } catch {
    // Blocked storage: the hint still hides for this session.
  }
}

/**
 * Which hint to show now. `session` maps a trigger to the day it is on screen in this session.
 * A trigger shows if its reason holds and it was not shown today yet (or is the one on screen now).
 */
export function pickHint(
  active: Readonly<Record<HintId, boolean>>,
  today: string,
  session: ReadonlyMap<HintId, string>,
  store: HintStore | null,
): HintId | null {
  for (const id of HINT_IDS) {
    if (!active[id]) continue;
    if (session.get(id) === today || read(store, id) !== today) return id;
  }
  return null;
}

/** React state around {@link pickHint}: records the show, ends it when the reason goes, × until tomorrow. */
export function useAssistantHint(active: Readonly<Record<HintId, boolean>>, now: Date, store: HintStore | null = storage()) {
  const today = playerDay(now);
  const session = useRef(new Map<HintId, string>());
  const [, rerender] = useState(0);
  const hint = pickHint(active, today, session.current, store);
  useEffect(() => {
    // A reason that ended does not come back the same day (no repeats in a row).
    for (const [id] of session.current) if (id !== hint) session.current.delete(id);
    if (hint && session.current.get(hint) !== today) {
      session.current.set(hint, today);
      write(store, hint, today);
    }
  }, [hint, today, store]);
  const dismiss = useCallback(() => {
    if (!hint) return;
    session.current.delete(hint);
    write(store, hint, today);
    rerender((n) => n + 1);
  }, [hint, today, store]);
  return { hint, dismiss };
}
