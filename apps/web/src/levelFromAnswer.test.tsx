// @vitest-environment jsdom
// Level / XP follow the server's answer to a mark, «Отменить» and «Вернуть» at once, without waiting for the
// reload of /player, /goals and /room (playtest: after «Отменить» 2 → 1 the header still showed «Уровень 02»).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AVATAR_CONFIG, playerDay } from "@levex/domain";
import { App } from "./App";
import type { Goal } from "./api";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** In-memory API: XP, levels (100 XP each), complete and undo. `hangPlayer()` makes every later GET /player hang. */
function server(initial: Goal[], startXp: number) {
  const goals = initial.map((goal) => ({ ...goal }));
  let xp = startXp;
  let hang = false;
  const progress = () => ({ xp, level: Math.floor(xp / 100) + 1, xpBySphere: { health: xp } });
  const player = () => ({
    id: "p1",
    nickname: "Игрок",
    avatarConfig: DEFAULT_AVATAR_CONFIG,
    progress: progress(),
    streak: 3,
    energy: { current: 45, max: 50 },
    today: { day: playerDay(new Date()), awarded: 1, awardCap: 5, ownAwarded: 0, ownAwardCap: 3 },
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/player") return hang ? new Promise<Response>(() => {}) : json(player());
    if (url === "/progress") return json(progress());
    if (url === "/room") return json({ placements: [] });
    if (url === "/goals" && method === "GET") return json(goals);
    const done = url.match(/^\/goals\/(.+)\/complete$/);
    if (done) {
      const goal = goals.find((item) => item.id === done[1])!;
      goal.status = "done";
      goal.completedAt = new Date().toISOString();
      goal.xpGranted = 10;
      xp += 10;
      return json({ goal, progress: progress(), awarded: true, awardedToday: 2, awardCap: 5 });
    }
    const undo = url.match(/^\/goals\/(.+)\/undo$/);
    if (undo) {
      const goal = goals.find((item) => item.id === undo[1])!;
      const removedXp = goal.xpGranted ?? 0;
      xp -= removedXp;
      goal.status = "open";
      delete goal.completedAt;
      delete goal.xpGranted;
      goal.undoneAt = new Date().toISOString();
      return json({ goal, progress: progress(), removedXp, awardedToday: 1, awardCap: 5 });
    }
    return json({ error: "not found" }, 404);
  }));
  return { hangPlayer: () => { hang = true; }, xp: () => xp };
}

const walk = (): Goal => ({ id: "w", title: "Утренняя прогулка 20 мин", sphere: "health", xpReward: 10, status: "open", templateId: "seed-walk" });
const header = () => document.querySelector(".lvl-hex b")?.textContent;
const today = () => screen.getByRole("complementary", { name: "Сегодня" });

async function renderApp() {
  render(<App />);
  await screen.findByText(/Серия: 3/);
}
async function markWalk() {
  fireEvent.click(within(today()).getByRole("button", { name: "Выполнить: Утренняя прогулка 20 мин" }));
}
function closeSheet() {
  fireEvent.keyDown(document, { key: "Escape" });
}
function openProfile() {
  fireEvent.click(screen.getAllByRole("button", { name: /Профиль/ })[0]!);
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("level from the server answer", () => {
  it("«Отменить» 2 → 1: header and profile drop at once, while the reload is still on its way", async () => {
    const api = server([walk()], 90);
    await renderApp();
    await markWalk();
    await waitFor(() => expect(header()).toBe("02"));
    closeSheet();
    openProfile();
    await screen.findByText("Уровень 2");
    api.hangPlayer();
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(header()).toBe("01"));
    expect(screen.getByText("Уровень 1")).toBeTruthy();
    expect(document.body.textContent).toContain("Proof открывается вместе с Мастерской на уровне 2.");
    expect(api.xp()).toBe(90);
  });

  it("a mark 1 → 2: the header rises from the complete answer, without the reload", async () => {
    const api = server([walk()], 90);
    await renderApp();
    expect(header()).toBe("01");
    api.hangPlayer();
    await markWalk();
    await waitFor(() => expect(header()).toBe("02"));
    expect(api.xp()).toBe(100);
  });

  it("«Вернуть» 1 → 2: the header rises from the answer, without the reload", async () => {
    const api = server([walk()], 90);
    await renderApp();
    await markWalk();
    await waitFor(() => expect(header()).toBe("02"));
    closeSheet();
    openProfile();
    fireEvent.click(await screen.findByRole("button", { name: "Отменить запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(header()).toBe("01"));
    api.hangPlayer();
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть запись: Утренняя прогулка 20 мин" }));
    await waitFor(() => expect(header()).toBe("02"));
    expect(screen.getByText("Уровень 2")).toBeTruthy();
  });
});
