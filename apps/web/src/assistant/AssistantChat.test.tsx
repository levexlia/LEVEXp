// @vitest-environment jsdom
import { ASSISTANT_MESSAGE_MAX_LENGTH, type AssistantReply } from "@levex/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantChat, historyFor, type ChatLine } from "./AssistantChat";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(ask = vi.fn<(m: string, h: unknown[]) => Promise<AssistantReply>>()) {
  const onClose = vi.fn();
  render(<AssistantChat ask={ask} onClose={onClose} errorText={(err) => (err as Error).message} />);
  const box = screen.getByLabelText("Сообщение помощнику") as HTMLTextAreaElement;
  const send = screen.getByRole("button", { name: "Отправить" }) as HTMLButtonElement;
  return { ask, onClose, box, send };
}

describe("AssistantChat", () => {
  it("shows loading, then the reply, and keeps the history for the next turn", async () => {
    const first = deferred<AssistantReply>();
    const ask = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({ reply: "Второй ответ", source: "ok" });
    const { box } = setup(ask);
    fireEvent.change(box, { target: { value: "Что делать?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Помощник печатает…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Жду ответ…" }) as HTMLButtonElement).disabled).toBe(true);
    first.resolve({ reply: "Начни с главы.", source: "ok" });
    expect(await screen.findByText("Начни с главы.")).toBeTruthy();
    expect(screen.getByRole("log").getAttribute("aria-busy")).toBe("false");

    fireEvent.change(box, { target: { value: "А потом?" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Второй ответ")).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith("А потом?", [
      { role: "user", content: "Что делать?" },
      { role: "assistant", content: "Начни с главы." },
    ]);
  });

  it("shows a friendly error with a retry", async () => {
    const ask = vi.fn()
      .mockRejectedValueOnce(new Error("Помощник сейчас не может ответить."))
      .mockResolvedValueOnce({ reply: "Теперь получилось", source: "ok" });
    const { box, send } = setup(ask);
    fireEvent.change(box, { target: { value: "Привет" } });
    fireEvent.click(send);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Помощник сейчас не может ответить.");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Теперь получилось")).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith("Привет", []);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("caps the message length on the client and does not send empty text", () => {
    const { ask, box, send } = setup();
    expect(box.maxLength).toBe(ASSISTANT_MESSAGE_MAX_LENGTH);
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "   " } });
    expect(send.disabled).toBe(true);
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
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const picked = historyFor(lines);
    expect(picked.length).toBeLessThanOrEqual(10);
    expect(picked[0]!.role).toBe("user");
    expect(picked.at(-1)!.content).toBe("m13");
    expect(historyFor([{ id: 1, role: "user", content: "hi" }, { id: 2, role: "assistant", content: "stub", offline: true }]))
      .toEqual([{ role: "user", content: "hi" }]);
  });
});
