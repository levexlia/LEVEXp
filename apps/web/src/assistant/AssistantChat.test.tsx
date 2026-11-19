// @vitest-environment jsdom
import { ASSISTANT_MESSAGE_MAX_LENGTH, type AssistantReply } from "@levex/domain";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantChat, historyFor, type AskFn, type ChatLine } from "./AssistantChat";
import { ROBOT_STATES, robotSrc, robotStateFor, typingSrc, type RobotState } from "./art";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(ask: AskFn = vi.fn(), reducedMotion = false) {
  const onClose = vi.fn();
  const states: RobotState[] = [];
  render(
    <AssistantChat
      ask={ask}
      onClose={onClose}
      errorText={(err) => (err as Error).message}
      onRobotState={(state) => states.push(state)}
      reducedMotion={reducedMotion}
    />,
  );
  const box = screen.getByLabelText("Сообщение помощнику") as HTMLTextAreaElement;
  const head = () => document.querySelector(".lx-chat__robot") as HTMLImageElement;
  const send = () => screen.getByRole("button", { name: /Отправить|Остановить ответ/ }) as HTMLButtonElement;
  const now = () => states.at(-1);
  return { ask, onClose, box, head, send, now, states };
}

describe("robot state", () => {
  it("maps the chat to idle, listening, thinking and speaking", () => {
    const base = { open: true, loading: false, typing: false, answerShown: false };
    expect(robotStateFor({ ...base, open: false, loading: true, typing: true, answerShown: true })).toBe("idle");
    expect(robotStateFor(base)).toBe("idle");
    expect(robotStateFor({ ...base, typing: true, answerShown: true })).toBe("listening");
    expect(robotStateFor({ ...base, loading: true, typing: true })).toBe("thinking");
    expect(robotStateFor({ ...base, answerShown: true })).toBe("speaking");
  });

  it("never uses happy (Лия decides when)", () => {
    expect(ROBOT_STATES).toEqual(["idle", "listening", "thinking", "speaking"]);
    expect(ROBOT_STATES as readonly string[]).not.toContain("happy");
  });

  it("uses the animated files, or the static copies with reduced motion", () => {
    expect(robotSrc("thinking", false)).toBe("/art/scene15/robot_thinking.svg");
    expect(robotSrc("thinking", true)).toBe("/art/scene15/static/robot_thinking_static.svg");
    expect(typingSrc(false)).toBe("/art/scene15/chat/chat_typing.svg");
    expect(typingSrc(true)).toBe("/art/scene15/static/chat_typing_static.svg");
  });
});

describe("AssistantChat", () => {
  it("goes idle → listening → thinking → speaking → listening, with matching art", async () => {
    const first = deferred<AssistantReply>();
    const ask = vi.fn<AskFn>().mockReturnValueOnce(first.promise);
    const { box, head, send, now, states } = setup(ask);
    expect(states[0]).toBe("idle");
    expect(head().getAttribute("src")).toBe("/art/scene15/robot_idle.svg");
    expect(send().querySelector("img")!.getAttribute("src")).toBe("/art/scene15/chat/chat_send_disabled.svg");

    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Что делать?" } });
    expect(now()).toBe("listening");
    expect(head().getAttribute("src")).toBe("/art/scene15/robot_listening.svg");
    expect(screen.getByText("СЛУШАЕТ")).toBeTruthy();
    expect(send().querySelector("img")!.getAttribute("src")).toBe("/art/scene15/chat/chat_send.svg");

    fireEvent.keyDown(box, { key: "Enter" });
    expect(now()).toBe("thinking");
    expect(head().getAttribute("src")).toBe("/art/scene15/robot_thinking.svg");
    expect(screen.getByText("ДУМАЕТ")).toBeTruthy();
    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("помощник думает…")).toBeTruthy();
    expect(document.querySelector(".lx-typing img")!.getAttribute("src")).toBe("/art/scene15/chat/chat_typing.svg");
    expect(send().getAttribute("aria-label")).toBe("Остановить ответ");
    expect(send().querySelector("img")!.getAttribute("src")).toBe("/art/scene15/chat/chat_stop.svg");

    await act(async () => first.resolve({ reply: "Начни с главы.", source: "ok" }));
    expect(screen.getByText("Начни с главы.")).toBeTruthy();
    expect(now()).toBe("speaking");
    expect(head().getAttribute("src")).toBe("/art/scene15/robot_speaking.svg");
    expect(screen.getByText("ГОВОРИТ")).toBeTruthy();

    fireEvent.change(box, { target: { value: "А потом?" } });
    expect(now()).toBe("listening");
    expect(states).not.toContain("happy");
  });

  it("uses the static robot and typing indicator with reduced motion", async () => {
    const first = deferred<AssistantReply>();
    const { box, head } = setup(vi.fn<AskFn>().mockReturnValueOnce(first.promise), true);
    expect(head().getAttribute("src")).toBe("/art/scene15/static/robot_idle_static.svg");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Привет" } });
    expect(head().getAttribute("src")).toBe("/art/scene15/static/robot_listening_static.svg");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(head().getAttribute("src")).toBe("/art/scene15/static/robot_thinking_static.svg");
    expect(document.querySelector(".lx-typing img")!.getAttribute("src")).toBe("/art/scene15/static/chat_typing_static.svg");
    await act(async () => first.resolve({ reply: "Ок", source: "ok" }));
    expect(head().getAttribute("src")).toBe("/art/scene15/static/robot_speaking_static.svg");
  });

  it("stops a pending answer: back to idle, the late answer is dropped", async () => {
    const first = deferred<AssistantReply>();
    let signal: AbortSignal | undefined;
    const ask = vi.fn<AskFn>((_m, _h, s) => { signal = s; return first.promise; });
    const { box, send, now } = setup(ask);
    fireEvent.change(box, { target: { value: "Привет" } });
    fireEvent.click(send());
    expect(now()).toBe("thinking");
    fireEvent.click(screen.getByRole("button", { name: "Остановить ответ" }));
    expect(signal?.aborted).toBe(true);
    expect(now()).toBe("idle");
    await act(async () => first.resolve({ reply: "Поздно", source: "ok" }));
    expect(screen.queryByText("Поздно")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the history for the next turn", async () => {
    const ask = vi.fn<AskFn>()
      .mockResolvedValueOnce({ reply: "Начни с главы.", source: "ok" })
      .mockResolvedValueOnce({ reply: "Второй ответ", source: "ok" });
    const { box, send } = setup(ask);
    fireEvent.change(box, { target: { value: "Что делать?" } });
    fireEvent.click(send());
    expect(await screen.findByText("Начни с главы.")).toBeTruthy();
    fireEvent.change(box, { target: { value: "А потом?" } });
    fireEvent.click(send());
    expect(await screen.findByText("Второй ответ")).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith(
      "А потом?",
      [
        { role: "user", content: "Что делать?" },
        { role: "assistant", content: "Начни с главы." },
      ],
      expect.any(AbortSignal),
    );
  });

  it("shows a friendly error with a retry; the robot is idle meanwhile", async () => {
    const ask = vi.fn<AskFn>()
      .mockRejectedValueOnce(new Error("Помощник сейчас не может ответить."))
      .mockResolvedValueOnce({ reply: "Теперь получилось", source: "ok" });
    const { box, send, now } = setup(ask);
    fireEvent.change(box, { target: { value: "Привет" } });
    fireEvent.click(send());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Помощник сейчас не может ответить.");
    expect(now()).toBe("idle");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Теперь получилось")).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith("Привет", [], expect.any(AbortSignal));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("caps the message length on the client and does not send empty text", () => {
    const { ask, box, send } = setup();
    expect(box.maxLength).toBe(ASSISTANT_MESSAGE_MAX_LENGTH);
    expect(send().disabled).toBe(true);
    fireEvent.change(box, { target: { value: "   " } });
    expect(send().disabled).toBe(true);
    fireEvent.change(box, { target: { value: "я".repeat(ASSISTANT_MESSAGE_MAX_LENGTH + 50) } });
    expect(box.value).toHaveLength(ASSISTANT_MESSAGE_MAX_LENGTH);
    expect(screen.getByText(`${ASSISTANT_MESSAGE_MAX_LENGTH}/${ASSISTANT_MESSAGE_MAX_LENGTH}`)).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
  });

  it("closes on Esc and on the close button", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Закрыть чат" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("sends only turns that fit the server limits and skips offline stubs", () => {
    const lines: ChatLine[] = Array.from({ length: 14 }, (_, i) => ({
      id: i,
      at: "21:00",
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const picked = historyFor(lines);
    expect(picked.length).toBeLessThanOrEqual(10);
    expect(picked[0]!.role).toBe("user");
    expect(picked.at(-1)!.content).toBe("m13");
    expect(historyFor([
      { id: 1, at: "21:00", role: "user", content: "hi" },
      { id: 2, at: "21:00", role: "assistant", content: "stub", offline: true },
    ])).toEqual([{ role: "user", content: "hi" }]);
  });
});
