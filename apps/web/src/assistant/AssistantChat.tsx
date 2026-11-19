import {
  ASSISTANT_HISTORY_ITEM_MAX_LENGTH,
  ASSISTANT_HISTORY_MAX_ITEMS,
  ASSISTANT_HISTORY_MAX_TOTAL,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  type AssistantReply,
  type AssistantTurn,
} from "@levex/domain";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { CHAT_ART, robotSrc, robotStateFor, typingSrc, type RobotState } from "./art";
import "./levex-chat.css";

export const GREETING = "Привет! Я помощник LEVEX. Помогу выбрать миссию или разбить её на маленькие шаги. О чём поговорим?";

/** Show the length counter from here on (the hard cap is ASSISTANT_MESSAGE_MAX_LENGTH). */
const COUNTER_FROM = ASSISTANT_MESSAGE_MAX_LENGTH - 100;

export interface ChatLine extends AssistantTurn {
  id: number;
  at: string;
  offline?: boolean;
}

export type AskFn = (message: string, history: AssistantTurn[], signal?: AbortSignal) => Promise<AssistantReply>;

const STATUS: Partial<Record<RobotState, { label: string; color: string }>> = {
  listening: { label: "СЛУШАЕТ", color: "#22e1ff" },
  thinking: { label: "ДУМАЕТ", color: "#b47bff" },
  speaking: { label: "ГОВОРИТ", color: "#22e1ff" },
};

function clock(): string {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

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

/** Bottom-sheet chat with the assistant (scene 15 layout). Esc or the backdrop closes it. */
export function AssistantChat({
  ask,
  onClose,
  errorText,
  returnFocus,
  onRobotState,
  reducedMotion,
}: {
  ask: AskFn;
  onClose: () => void;
  errorText: (err: unknown) => string;
  /** Where focus goes when the sheet closes (the robot). Defaults to what had focus before. */
  returnFocus?: RefObject<HTMLElement | null>;
  /** The map robot mirrors the chat's state. */
  onRobotState?: (state: RobotState) => void;
  reducedMotion: boolean;
}) {
  const titleId = useId();
  const counterId = useId();
  const [openedAt] = useState(clock);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; retry: string } | null>(null);
  const nextId = useRef(1);
  const pending = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const state = robotStateFor({
    open: true,
    loading,
    typing: focused && draft.trim().length > 0,
    answerShown: lines.at(-1)?.role === "assistant",
  });

  useEffect(() => {
    onRobotState?.(state);
  }, [state, onRobotState]);

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
      pending.current?.abort();
      (returnFocus?.current ?? previous)?.focus?.();
    };
  }, [onClose, returnFocus]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, loading, error]);

  const text = draft.trim();
  const canSend = !loading && text.length > 0 && draft.length <= ASSISTANT_MESSAGE_MAX_LENGTH;

  async function send(message: string, base: ChatLine[]) {
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    try {
      const answer = await ask(message, historyFor(base), controller.signal);
      if (controller.signal.aborted) return;
      setLines((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: answer.reply, at: clock(), offline: answer.source === "offline" },
      ]);
    } catch (err) {
      if (!controller.signal.aborted) setError({ text: errorText(err), retry: message });
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  function stop() {
    pending.current?.abort();
    pending.current = null;
    setLoading(false);
    input.current?.focus();
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const base = lines;
    setLines([...lines, { id: nextId.current++, role: "user", content: text, at: clock() }]);
    setDraft("");
    void send(text, base);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const status = STATUS[state];

  return (
    <div className="lx-chat-root" data-robot-state={state}>
      <div className="lx-chat-dim" aria-hidden="true" onClick={onClose} />
      <section className="lx-chat" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="lx-chat__in">
          <div className="lx-chat__grab" aria-hidden="true" />
          <header className="lx-chat__head">
            <div className="lx-chat__ava" aria-hidden="true">
              <div className="cr">
                <img className="lx-chat__robot" src={robotSrc(state, reducedMotion)} alt="" />
              </div>
            </div>
            <div>
              <p className="lx-chat__meta">LEVEX · XP И ПРОГРЕСС НЕ МЕНЯЕТ</p>
              <h2 className="lx-chat__ttl" id={titleId}>ИИ-помощник</h2>
              {status ? (
                <span className="lx-chat__st" style={{ "--sc": status.color } as CSSProperties} aria-hidden="true">
                  <i />
                  {status.label}
                </span>
              ) : null}
            </div>
            <button type="button" className="lx-chat__close" onClick={onClose} aria-label="Закрыть чат">
              <img src={CHAT_ART.close} width={32} height={32} alt="" />
            </button>
          </header>

          <div className="lx-chat__log" ref={log} role="log" aria-live="polite" aria-busy={loading} aria-label="Сообщения">
            <div className="lx-msg lx-msg--bot">
              <div className="lx-msg__meta" aria-hidden="true">ИИ-ПОМОЩНИК · {openedAt}</div>
              <p className="lx-msg__b">{GREETING}</p>
            </div>
            {lines.map((line) => (
              <div key={line.id} className={`lx-msg ${line.role === "user" ? "lx-msg--me" : "lx-msg--bot"}${line.offline ? " is-offline" : ""}`}>
                <div className="lx-msg__meta" aria-hidden="true">
                  {line.role === "user" ? "ТЫ" : "ИИ-ПОМОЩНИК"} · {line.at}
                </div>
                <p className="lx-msg__b">
                  <span className="sr-only">{line.role === "user" ? "Ты: " : "Помощник: "}</span>
                  {line.content}
                </p>
              </div>
            ))}
            {loading ? (
              <div className="lx-typing" role="status">
                <img src={typingSrc(reducedMotion)} width={44} height={20} alt="" />
                <span>помощник думает…</span>
              </div>
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

          <form className="lx-chat__bar" onSubmit={submit}>
            <label className="sr-only" htmlFor={`${titleId}-input`}>Сообщение помощнику</label>
            <textarea
              id={`${titleId}-input`}
              ref={input}
              className={`lx-chat__field${focused ? " focus" : ""}`}
              rows={1}
              value={draft}
              maxLength={ASSISTANT_MESSAGE_MAX_LENGTH}
              placeholder="Напиши помощнику…"
              aria-describedby={counterId}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(event) => setDraft(event.target.value.slice(0, ASSISTANT_MESSAGE_MAX_LENGTH))}
              onKeyDown={onKeyDown}
            />
            {loading ? (
              <button type="button" className="lx-chat__send" onClick={stop} aria-label="Остановить ответ">
                <img src={CHAT_ART.stop} width={48} height={48} alt="" />
              </button>
            ) : (
              <button type="submit" className="lx-chat__send" disabled={!canSend} aria-label="Отправить">
                <img src={canSend ? CHAT_ART.send : CHAT_ART.sendDisabled} width={48} height={48} alt="" />
              </button>
            )}
          </form>
          <small id={counterId} className={`lx-chat__count${draft.length >= COUNTER_FROM ? " is-near" : " sr-only"}${draft.length >= ASSISTANT_MESSAGE_MAX_LENGTH ? " at-limit" : ""}`}>
            {draft.length}/{ASSISTANT_MESSAGE_MAX_LENGTH}
          </small>
        </div>
      </section>
    </div>
  );
}
