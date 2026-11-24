import { describe, expect, it } from "vitest";
import { HINT_KEY, pickHint, type HintId } from "./hints";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("assistant hints: once per player day per trigger", () => {
  const none = new Map<HintId, string>();
  it("shows an active trigger that was not shown today; «3/3» comes before the empty day", () => {
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-11-24", none, memory())).toBe("empty_day");
    expect(pickHint({ own_cap: true, empty_day: true }, "2026-11-24", none, memory())).toBe("own_cap");
    expect(pickHint({ own_cap: false, empty_day: false }, "2026-11-24", none, memory())).toBeNull();
  });
  it("a trigger shown (or hidden with ×) today stays away until the next day; another trigger may show", () => {
    const store = memory({ [HINT_KEY("own_cap")]: "2026-11-24" });
    expect(pickHint({ own_cap: true, empty_day: false }, "2026-11-24", none, store)).toBeNull();
    expect(pickHint({ own_cap: true, empty_day: true }, "2026-11-24", none, store)).toBe("empty_day");
    expect(pickHint({ own_cap: true, empty_day: false }, "2026-11-25", none, store)).toBe("own_cap");
  });
  it("the hint on screen in this session stays while its reason holds", () => {
    const store = memory({ [HINT_KEY("empty_day")]: "2026-11-24" });
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-11-24", new Map([["empty_day", "2026-11-24"]]), store)).toBe("empty_day");
  });
  it("blocked storage does not break the app", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-11-24", none, broken)).toBe("empty_day");
    expect(pickHint({ own_cap: false, empty_day: true }, "2026-11-24", none, null)).toBe("empty_day");
  });
});
