import { REFLECTION_FEELINGS, REFLECTION_LABEL, REFLECTION_NOTE_MAX, type ReflectionFeeling } from "@levex/domain";
import { useEffect, useState } from "react";
import type { Goal } from "../api";

export interface AfterMissionInfo {
  goal: Goal;
  awarded: boolean;
  /** XP added by this completion (0 without XP). */
  gained: number;
  /** Daily-rules text when recorded without XP. */
  message?: string;
  /** False when a copy can't be made (place locked, or one is already open for tomorrow). */
  canRepeat: boolean;
}

/**
 * Short sheet after a completed mission: «Повторить завтра?» (spec №1) and «Как прошло?» (spec №3).
 * Both are optional; «Пропустить» closes it and changes nothing. The reflection never changes XP.
 */
export function AfterMission({
  info,
  busy,
  onRepeat,
  onReflect,
  onClose,
}: {
  info: AfterMissionInfo;
  busy: boolean;
  onRepeat: (goalId: string) => Promise<boolean>;
  onReflect: (goalId: string, felt: ReflectionFeeling, note: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [repeat, setRepeat] = useState<"ask" | "yes" | "no">(info.canRepeat ? "ask" : "no");
  const [felt, setFelt] = useState<ReflectionFeeling | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section className="lx-sheet sheet after" role="dialog" aria-modal="true" aria-labelledby="after-title" onClick={(event) => event.stopPropagation()}>
        <div className="lx-sheet__in">
          <div className="grab" aria-hidden="true" />
          <h2 id="after-title">«{info.goal.title}» выполнена</h2>
          {info.awarded ? (
            <p className="after__result">+{info.gained} XP</p>
          ) : info.message ? (
            <p className="after__result is-calm" role="status">{info.message}</p>
          ) : null}

          {repeat === "ask" ? (
            <div className="after__block" data-after="repeat">
              <p className="ps-label">Повторить завтра?</p>
              <div className="activity__row">
                <button
                  type="button"
                  className="lx-btn lx-btn--sm"
                  disabled={busy}
                  onClick={async () => {
                    if (await onRepeat(info.goal.id)) setRepeat("yes");
                  }}
                >
                  <span className="lx-btn__in">Да, на завтра</span>
                </button>
                <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" onClick={() => setRepeat("no")}>
                  <span className="lx-btn__in">Не сейчас</span>
                </button>
              </div>
            </div>
          ) : repeat === "yes" ? (
            <p className="after__block after__ok" role="status">Поставлено на завтра. Утром будет в «Сегодня».</p>
          ) : null}

          <form
            className="after__block"
            data-after="reflection"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!felt) return;
              if (await onReflect(info.goal.id, felt, note)) onClose();
            }}
          >
            <p className="ps-label" id="felt-label">Как прошло?</p>
            <div className="activity__row" role="group" aria-labelledby="felt-label">
              {REFLECTION_FEELINGS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="lx-chip filter-chip"
                  aria-pressed={felt === value}
                  onClick={() => setFelt(value)}
                >
                  <span className="lx-chip__in">{REFLECTION_LABEL[value]}</span>
                </button>
              ))}
            </div>
            <label className="lx-field">
              <span>Заметка (необязательно)</span>
              <textarea value={note} rows={2} maxLength={REFLECTION_NOTE_MAX} placeholder="Что заметил(а)?" onChange={(event) => setNote(event.target.value)} />
            </label>
            <p className="field-hint">{note.length}/{REFLECTION_NOTE_MAX} · на XP не влияет</p>
            <div className="ps-actions">
              <button type="button" className="lx-btn lx-btn--secondary ps-later" onClick={onClose}>
                <span className="lx-btn__in">Пропустить</span>
              </button>
              <button type="submit" className="lx-btn ps-primary" disabled={busy || !felt}>
                <span className="lx-btn__in">Сохранить</span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
