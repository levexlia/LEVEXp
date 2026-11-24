// @vitest-environment jsdom
/** scene18: today's records with «Отменить» / «Вернуть» and «Журнал недели» in Профиль. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, canUndo } from "@levex/domain";
import { App } from "../App";
import type { Goal } from "../api";
import { journalWeek, todayEntries, weekLabel, weekStart } from "./journal";

const NOW = new Date("2026-11-24T10:00:00.000Z"); // Tue 24.11, 12:00 in Israel
const done = (id: string, sphere: string, iso: string, extra: Partial<Goal> = {}): Goal => ({ id, title: `Миссия ${id}`, sphere, xpReward: 10, status: "done", completedAt: iso, xpGranted: 10, ...extra });

describe("journal (pure)", () => {
  it("weeks start on Monday, labels in the mock's format", () => {
    expect(weekStart("2026-11-24")).toBe("2026-11-23");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekLabel("2026-11-16")).toBe("16 — 22 НОЯБРЯ");
    expect(weekLabel("2026-11-30")).toBe("30 НОЯБРЯ — 6 ДЕКАБРЯ");
  });

  it("days with sphere marks (×N), a plain per-sphere count, no future days, paging bounds", () => {
    const goals: Goal[] = [
      done("a", "health", "2026-11-23T06:00:00.000Z"),
      done("b", "health", "2026-11-23T07:00:00.000Z", { xpGranted: 0, noXpReason: "daily_cap" }),
      done("c", "finance", "2026-11-24T06:00:00.000Z"),
      done("d", "mind", "2026-11-17T06:00:00.000Z"),
      { id: "u", title: "Отменённая", sphere: "spirit", xpReward: 10, status: "open", undoneAt: "2026-11-24T08:00:00.000Z" },
    ];
    const week = journalWeek(goals, 0, NOW);
    expect(week.label).toBe("23 — 29 НОЯБРЯ");
    expect(week.days.map((day) => day.day)).toEqual(["2026-11-23", "2026-11-24"]);
    // A record without XP is still a mark; a record taken back is not.
    expect(week.days[0]!.marks).toEqual([{ sphere: "health", name: "Здоровье", count: 2 }]);
    expect(week.days[1]).toMatchObject({ today: true, marks: [{ sphere: "finance", name: "Финансы", count: 1 }] });
    expect(week.sum).toEqual([{ sphere: "health", name: "Здоровье", count: 2 }, { sphere: "finance", name: "Финансы", count: 1 }]);
    expect(week).toMatchObject({ canPrev: true, canNext: false });
    const last = journalWeek(goals, -1, NOW);
    expect(last.days).toHaveLength(7);
    expect(last.days.filter((day) => day.marks.length === 0)).toHaveLength(6);
    expect(last).toMatchObject({ label: "16 — 22 НОЯБРЯ", canPrev: false, canNext: true });
  });

  it("today's entries: records of today (undoable), then the ones taken back today; canUndo is today only", () => {
    const goals: Goal[] = [
      done("y", "health", "2026-11-23T08:00:00.000Z"),
      done("t", "spirit", "2026-11-24T08:00:00.000Z"),
      { id: "u", title: "Отменённая", sphere: "relationships", xpReward: 10, status: "open", undoneAt: "2026-11-24T09:00:00.000Z" },
      { id: "old", title: "Отменена вчера", sphere: "health", xpReward: 10, status: "open", undoneAt: "2026-11-23T09:00:00.000Z" },
    ];
    expect(todayEntries(goals, NOW).map((item) => [item.id, item.undoable, item.undone, item.where])).toEqual([
      ["t", true, false, "Дух · Парк"],
      ["u", false, true, "Отношения · где угодно"],
    ]);
    expect(canUndo(goals[0]!, NOW)).toBe(false);
    expect(canUndo(goals[1]!, NOW)).toBe(true);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function server(initial: Goal[]) {
  const goals = initial.map((goal) => ({ ...goal }));
  const player = {
    id: "p1", nickname: "Игрок", avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: { xp: 20, level: 1, xpBySphere: { health: 10, spirit: 10 } as Record<string, number> },
    streak: 2, energy: { current: 45, max: 50 },
    today: { day: "2026-11-24", awarded: 1, awardCap: 5, ownAwarded: 0, ownAwardCap: 3 },
  };
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url === "/player") return json(player);
    if (url === "/room") return json({ placements: [] });
    if (url === "/goals") return json(goals);
    const undo = url.match(/^\/goals\/(.+)\/undo$/);
    if (undo) {
      const goal = goals.find((item) => item.id === undo[1])!;
      const removedXp = goal.xpGranted ?? 0;
      goal.status = "open"; delete goal.completedAt; delete goal.xpGranted; goal.undoneAt = new Date().toISOString();
      player.progress = { ...player.progress, xp: player.progress.xp - removedXp };
      return json({ goal, progress: player.progress, removedXp, awardedToday: 0, awardCap: 5 });
    }
    const complete = url.match(/^\/goals\/(.+)\/complete$/);
    if (complete) {
      const goal = goals.find((item) => item.id === complete[1])!;
      goal.status = "done"; goal.completedAt = new Date().toISOString(); goal.xpGranted = 10; delete goal.undoneAt;
      player.progress = { ...player.progress, xp: player.progress.xp + 10 };
      return json({ goal, progress: player.progress, awarded: true, awardedToday: 1, awardCap: 5 });
    }
    return json({ error: "not found" }, 404);
  }));
  return { goals, calls };
}

describe("Профиль: «Отменить» / «Вернуть» and «Журнал недели»", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("«Отменить» sends POST /goals/:id/undo without a dialog; the row says «запись отменена» and offers «Вернуть»", async () => {
    const api = server([done("t", "spirit", "2026-11-24T08:00:00.000Z", { title: "Прогулка без телефона" }), done("y", "health", "2026-11-23T08:00:00.000Z", { title: "Зарядка" })]);
    render(<App />);
    await screen.findByText(/Серия: 2/);
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    const today = screen.getByRole("region", { name: "Сегодня · ВТ 24" });
    expect(today.textContent).toContain("Если запись сделана по ошибке, её можно отменить. Это можно сделать до конца дня.");
    const row = today.querySelector('[data-entry="t"]')!;
    expect(row.querySelector(".lx-entry__meta")?.textContent).toBe("Дух · Парк");
    // Yesterday: as it is, no button.
    const past = today.querySelector('[data-entry="y"]')!;
    expect(past.className).toContain("is-past");
    expect(past.querySelector("button")).toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Отменить запись: Прогулка без телефона" }));
    await waitFor(() => expect(today.querySelector('[data-entry="t"]')?.className).toContain("is-undone"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls.some((call) => call.method === "POST" && call.url === "/goals/t/undo")).toBe(true);
    expect(today.querySelector('[data-entry="t"] .lx-entry__meta')?.textContent).toBe("Дух · запись отменена");
    expect(await screen.findByText("Запись «Прогулка без телефона» отменена. XP за неё снят: 10.")).toBeTruthy();
    fireEvent.click(within(today).getByRole("button", { name: "Вернуть запись: Прогулка без телефона" }));
    await waitFor(() => expect(today.querySelector('[data-entry="t"]')?.className).not.toContain("is-undone"));
    expect(api.calls.some((call) => call.method === "POST" && call.url === "/goals/t/complete")).toBe(true);
  });

  it("«Журнал недели»: days with sphere icons, a per-sphere count, paging; no bars, percentages, «из N» or red", async () => {
    server([
      done("a", "health", "2026-11-23T06:00:00.000Z"), done("b", "health", "2026-11-23T07:00:00.000Z"),
      done("c", "finance", "2026-11-24T06:00:00.000Z"), done("d", "mind", "2026-11-18T06:00:00.000Z"),
    ]);
    render(<App />);
    await screen.findByText(/Серия: 2/);
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    const week = screen.getByRole("region", { name: "Журнал недели" });
    expect(week.querySelector(".lx-week__nav span")?.textContent).toBe("23 — 29 НОЯБРЯ");
    const monday = week.querySelector('[data-day="2026-11-23"]')!;
    expect(monday.querySelector(".lx-sp img")?.getAttribute("src")).toBe("/map/sp_sport.svg");
    expect(monday.querySelector(".lx-sp__n")?.textContent).toBe("×2");
    expect(week.querySelector('[data-day="2026-11-24"]')?.className).toContain("is-today");
    expect(week.querySelector('.lx-week__sum [data-sphere="health"] em')?.textContent).toBe("2");
    expect((within(week).getByRole("button", { name: "Следующая неделя" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(week).getByRole("button", { name: "Прошлая неделя" }));
    expect(week.querySelector(".lx-week__nav span")?.textContent).toBe("16 — 22 НОЯБРЯ");
    expect(week.querySelectorAll(".lx-day")).toHaveLength(7);
    expect(week.querySelector('[data-day="2026-11-16"]')?.textContent).toContain("Без отметок");
    expect(week.querySelector('[data-day="2026-11-18"] .lx-sp img')?.getAttribute("alt")).toBe("Разум");
    expect((within(week).getByRole("button", { name: "Прошлая неделя" }) as HTMLButtonElement).disabled).toBe(true);
    const text = week.textContent ?? "";
    expect(text).not.toMatch(/%|из \d|пропуск|провал/i);
    expect(week.querySelector("progress, .bar, .bars, [role='progressbar']")).toBeNull();
  });
});
