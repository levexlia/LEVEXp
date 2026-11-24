import { useEffect, useRef, useState } from "react";
import type { Goal } from "../api";
import { placeForSphere, placeName } from "../map/missions";
import { activityAid, clock } from "./activity";

/**
 * Spec №2: «Начать» opens a calm screen for the mission. The timer / page counter is optional and can
 * be stopped; «Я закончил — отметить» works at any moment and closes the goal like «Выполнить».
 * «Не сейчас» goes back and the goal stays open. No "time is not up" texts.
 */
export function ActivityScreen({
  goal,
  busy,
  reducedMotion,
  onDone,
  onClose,
}: {
  goal: Goal;
  busy: boolean;
  reducedMotion: boolean;
  onDone: (goalId: string) => void;
  onClose: () => void;
}) {
  const aid = activityAid(goal.title);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pages, setPages] = useState(0);
  const startedAt = useRef<number | null>(null);
  const base = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const timer = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(base.current + (Date.now() - startedAt.current) / 1000);
    }, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  function toggle() {
    if (running && startedAt.current !== null) {
      base.current += (Date.now() - startedAt.current) / 1000;
      setElapsed(base.current);
      startedAt.current = null;
    }
    setRunning(!running);
  }

  function reset() {
    setRunning(false);
    base.current = 0;
    startedAt.current = null;
    setElapsed(0);
  }

  const total = aid.kind === "timer" ? aid.minutes * 60 : 0;
  const left = Math.max(0, total - elapsed);
  const finishedTimer = aid.kind === "timer" && elapsed > 0 && left === 0;
  const place = placeName(placeForSphere(goal.sphere));
  const ratio = aid.kind === "timer" ? Math.min(1, elapsed / total) : aid.kind === "pages" ? Math.min(1, pages / aid.pages) : 0;

  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section
        className="lx-sheet sheet activity"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        data-activity={aid.kind}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lx-sheet__in">
          <div className="grab" aria-hidden="true" />
          <p className="ps-meta">Занятие · {place}</p>
          <h2 id="activity-title" className="activity__title">{goal.title}</h2>

          {aid.kind === "pages" ? (
            <div className="activity__aid">
              <p className="activity__big" aria-live="polite">{pages} / {aid.pages}<small> страниц</small></p>
              {pages >= aid.pages ? <p className="activity__goal" role="status">Цель достигнута</p> : null}
              <div className="activity__row">
                <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" onClick={() => setPages((v) => Math.max(0, v - 1))} aria-label="Минус страница">
                  <span className="lx-btn__in">−1</span>
                </button>
                <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" onClick={() => setPages((v) => v + 1)} aria-label="Плюс страница">
                  <span className="lx-btn__in">+1 страница</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="activity__aid">
              <p className="activity__big" role="timer" aria-live="off">{clock(aid.kind === "timer" ? left : elapsed)}</p>
              <div className="activity__row">
                {elapsed === 0 && !running ? (
                  // Nothing starts by itself: the timer is a choice, marking never needs it.
                  <button type="button" className="lx-btn activity__start" onClick={toggle}>
                    <span className="lx-btn__in">{aid.kind === "timer" ? "Запустить таймер" : "Запустить секундомер"}</span>
                  </button>
                ) : (
                  <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" onClick={toggle} disabled={finishedTimer}>
                    <span className="lx-btn__in">{running ? "Пауза" : "Продолжить"}</span>
                  </button>
                )}
                {elapsed > 0 ? (
                  <button type="button" className="quiet" onClick={reset}>Сбросить</button>
                ) : null}
              </div>
              {finishedTimer ? <p className="activity__note" role="status">Время вышло. Можно отметить, когда будет удобно.</p> : null}
            </div>
          )}
          <div className={reducedMotion ? "activity__bar still" : "activity__bar"} aria-hidden="true"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
          <p className="activity__note">{aid.kind === "pages" ? "Счётчик" : aid.kind === "timer" ? "Таймер" : "Секундомер"} необязателен: отметить можно в любой момент.</p>

          <div className="ps-actions">
            <button type="button" className="lx-btn lx-btn--secondary ps-later" onClick={onClose}>
              <span className="lx-btn__in">Не сейчас</span>
            </button>
            <button type="button" className="lx-btn ps-primary" disabled={busy} onClick={() => onDone(goal.id)}>
              <span className="lx-btn__in">Я закончил — отметить</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
