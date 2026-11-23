// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { CHAT_OPENED_KEY } from "./assistant/tapMarker";


const player = {
  id: "p1",
  nickname: "Лия",
  progress: { xp: 20, level: 1, xpBySphere: {} },
  streak: 1,
  energy: { current: 5, max: 50 },
};
const goals = [{ id: "g1", title: "Прочитать главу", sphere: "mind", xpReward: 10, status: "open" }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("App: avatar in Профиль, assistant on the map", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/player") return json(player);
      if (url === "/goals") return json(goals);
      if (url === "/room") return json({ placements: [] });
      if (url === "/assistant/chat" && init?.method === "POST") {
        return json({ reply: "ИИ пока не подключён.", source: "offline" });
      }
      return json({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function renderApp() {
    const view = render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/player", expect.anything()));
    return view;
  }

  it("shows the assistant robot on the map and no player avatar there", async () => {
    const { container } = await renderApp();
    const robot = screen.getByRole("button", { name: /ИИ-помощник/ });
    expect(robot.querySelector("img")?.getAttribute("src")).toBe("/art/scene15/robot_idle.svg");
    // A fresh player sees the «нажми» marker over the robot.
    expect(robot.querySelector('img[src*="tap_marker"]')?.getAttribute("src")).toBe("/art/scene15/robot_tap_marker.svg");
    expect(robot.closest(".map-frame")).not.toBeNull();
    // Only the scene15 robot: no parts-kit girl and no scene14 operator on the map, header or desktop column.
    expect(container.querySelectorAll("svg.hero")).toHaveLength(0);
    expect(container.querySelector('img[src*="operator"]')).toBeNull();
    expect(container.querySelector(".map-avatar, .stage-avatar, .mini, .lx-avatar")).toBeNull();
    const figures = [...container.querySelectorAll(".map-frame img")].map((img) => img.getAttribute("src") ?? "");
    expect(figures.filter((src) => src.includes("/avatar/") || (src.includes("robot_") && !src.includes("tap_marker")))).toEqual(["/art/scene15/robot_idle.svg"]);
    expect(screen.queryByRole("img", { name: /Персонаж|Мой персонаж/ })).toBeNull();
  });

  it("shows the avatar on the Профиль screen", async () => {
    const { container } = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    const avatar = await screen.findByRole("img", { name: "Мой персонаж" });
    expect(avatar.closest(".profile-avatar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Собрать персонажа" })).toBeTruthy();
    expect(container.querySelector(".map-robot")).toBeNull();
  });

  it("opens the chat sheet from the robot, answers, and closes on Esc", async () => {
    await renderApp();
    const robot = screen.getByRole("button", { name: /ИИ-помощник/ });
    expect(robot.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(robot);
    const dialog = screen.getByRole("dialog", { name: "ИИ-помощник" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(robot.getAttribute("aria-expanded")).toBe("true");
    const box = within(dialog).getByLabelText("Сообщение помощнику");
    expect(document.activeElement).toBe(box);

    const mapImg = robot.querySelector("img")!;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Привет" } });
    expect(mapImg.getAttribute("src")).toBe("/art/scene15/robot_listening.svg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Отправить" }));
    expect(await within(dialog).findByText("ИИ пока не подключён.")).toBeTruthy();
    await waitFor(() => expect(mapImg.getAttribute("src")).toBe("/art/scene15/robot_speaking.svg"));
    const call = fetchMock.mock.calls.find(([url]) => url === "/assistant/chat")!;
    expect(JSON.parse(String(call[1].body))).toEqual({ message: "Привет", history: [] });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "ИИ-помощник" })).toBeNull();
    expect(document.activeElement).toBe(robot);
    expect(mapImg.getAttribute("src")).toBe("/art/scene15/robot_idle.svg");
  });

  it("hides the «нажми» marker after the first chat and remembers it in localStorage", async () => {
    const first = await renderApp();
    const robot = screen.getByRole("button", { name: /ИИ-помощник/ });
    expect(robot.querySelector(".map-robot__marker")).not.toBeNull();
    expect(localStorage.getItem(CHAT_OPENED_KEY)).toBeNull();
    fireEvent.click(robot);
    expect(localStorage.getItem(CHAT_OPENED_KEY)).toBe("1");
    expect(robot.querySelector(".map-robot__marker")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(robot.querySelector(".map-robot__marker")).toBeNull();
    first.unmount();

    // Next visit: still hidden.
    await renderApp();
    expect(screen.getByRole("button", { name: /ИИ-помощник/ }).querySelector(".map-robot__marker")).toBeNull();
  });

  it("shows the static robot on the map with reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await renderApp();
    const robot = screen.getByRole("button", { name: /ИИ-помощник/ });
    expect(robot.querySelector("img")?.getAttribute("src")).toBe("/art/scene15/static/robot_idle_static.svg");
    expect(robot.querySelector(".map-robot__marker")?.getAttribute("src")).toBe("/art/scene15/static/robot_tap_marker_static.svg");
  });
});
