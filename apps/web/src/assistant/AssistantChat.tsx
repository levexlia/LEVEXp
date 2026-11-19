import {
  ASSISTANT_HISTORY_ITEM_MAX_LENGTH,
  ASSISTANT_HISTORY_MAX_ITEMS,
  ASSISTANT_HISTORY_MAX_TOTAL,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  type AssistantReply,
  type AssistantTurn,
} from "@levex/domain";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ASSISTANT_ROBOT_SVG } from "./art";

export const GREETING = "Привет! Я помощник LEVEX. Помогу выбрать миссию или разбить её на маленькие шаги. О чём поговорим?";

export interface ChatLine extends AssistantTurn {
  id: number;
  offline?: boolean;
}

export type AskFn = (message: string, history: AssistantTurn[]) => Promise<AssistantReply>;

/** Last turns that fit the server limits (count, per-item and total length). */
export function historyFor(lines: readonly ChatLine[]): AssistantTurn[] {
  const picked: AssistantTurn[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0 && picked.length < ASSISTANT_HISTORY_MAX_ITEMS; i -= 1) {
    const line = lines[i]!;
    if (line.offline) continue;
    const content = line.content.slice(0, ASSISTANT_HISTORY_ITEM_MAX_LENGTH);
    if (total + content.length > ASSISTANT_HISTORY_MAX_TOTAL) break;
    total += content.length;
    picked.unshift({ role: line.role, content });
  }
  // The model expects the history to start with the player.
  while (picked[0]?.role === "assistant") picked.shift();
  return picked;
}

/** Bottom-sheet chat with the assistant. Esc or the backdrop closes it. */
export function AssistantChat({
  ask,
  onClose,
  errorText,
  returnFocus,
}: {
  ask: AskFn;
  onClose: () => void;
  errorText: (err: unknown) => string;
  /** Where focus goes when the sheet closes (the robot). Defaults to what had focus before. */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const counterId = useId();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; retry: string } | null>(null);
  const nextId = useRef(1);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (returnFocus?.current ?? previous)?.focus?.();
    };
  }, [onClose, returnFocus]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, loading, error]);

  const text = draft.trim();
  const tooLong = draft.length > ASSISTANT_MESSAGE_MAX_LENGTH;
  const canSend = !loading && text.length > 0 && !tooLong;

  async function send(message: string, base: ChatLine[]) {
    setLoading(true);
    setError(null);
    try {
      const answer = await ask(message, historyFor(base));
      setLines((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: answer.reply, offline: answer.source === "offline" },
      ]);
    } catch (err) {
      setError({ text: errorText(err), retry: message });
    } finally {
      setLoading(false);
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const base = lines;
    setLines([...lines, { id: nextId.current++, role: "user", content: text }]);
    setDraft("");
    void send(text, base);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="sheet-back chat-back" role="presentation" onClick={onClose}>
      <section
        className="sheet chat-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chat-head">
          <img src={ASSISTANT_ROBOT_SVG} alt="" width={24} height={48} />
          <div>
            <h2 id={titleId}>ИИ-помощник</h2>
            <p>Подсказывает и поддерживает. XP и прогресс не меняет.</p>
          </div>
          <button type="button" className="quiet" onClick={onClose} aria-label="Закрыть чат">Закрыть</button>
        </header>

        <div className="chat-log" ref={log} role="log" aria-live="polite" aria-busy={loading} aria-label="Сообщения">
          <p className="bubble from-assistant">{GREETING}</p>
          {lines.map((line) => (
            <p key={line.id} className={`bubble from-${line.role}${line.offline ? " is-offline" : ""}`}>
              <span className="sr-only">{line.role === "user" ? "Ты: " : "Помощник: "}</span>
              {line.content}
            </p>
          ))}
          {loading ? (
            <p className="bubble from-assistant is-typing" role="status">
              <span className="dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="sr-only">Помощник печатает…</span>
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="chat-error" role="alert">
            <span>{error.text}</span>
            <button type="button" className="quiet" disabled={loading} onClick={() => void send(error.retry, lines.slice(0, -1))}>
              Повторить
            </button>
          </div>
        ) : null}

        <form className="chat-form" onSubmit={submit}>
          <label className="sr-only" htmlFor={`${titleId}-input`}>Сообщение помощнику</label>
          <textarea
            id={`${titleId}-input`}
            ref={input}
            rows={2}
            value={draft}
            maxLength={ASSISTANT_MESSAGE_MAX_LENGTH}
            placeholder="Спроси о миссиях или о том, с чего начать"
            aria-describedby={counterId}
            aria-invalid={tooLong}
            onChange={(event) => setDraft(event.target.value.slice(0, ASSISTANT_MESSAGE_MAX_LENGTH))}
            onKeyDown={onKeyDown}
          />
          <div className="chat-send">
            <small id={counterId} className={draft.length >= ASSISTANT_MESSAGE_MAX_LENGTH ? "at-limit" : undefined}>
              {draft.length}/{ASSISTANT_MESSAGE_MAX_LENGTH}
            </small>
            <button type="submit" className="done" disabled={!canSend}>
              {loading ? "Жду ответ…" : "Отправить"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
