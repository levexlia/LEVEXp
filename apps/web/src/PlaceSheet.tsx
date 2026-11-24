import type { MapNodeId, MapNodeState } from "@levex/domain";
import { useEffect } from "react";
import type { Goal } from "./api";
import { placeIconUrl } from "./map/placeIcons";
import { ACTION_LABEL, placeSheet, segments, type SheetAction } from "./map/placeSheet";
import { artSrc } from "./theme/motion";
import { MISSION_OPEN_URL, REWARD_ICON_URL, hexFrameUrl } from "./theme/uiArt";

const UI = "/art/scene14/ui";
const ACTION_ICON: Partial<Record<SheetAction, string>> = {
  start: `${UI}/ic_play.svg`,
  enter: `${UI}/ic_play.svg`,
  repeat: `${UI}/ic_missions.svg`,
};

export function PlaceSheet({
  id,
  state,
  goals,
  level,
  xp,
  busy,
  reducedMotion,
  hint,
  onClose,
  onEnter,
  onMissions,
  onDone,
  onProof,
}: {
  id: MapNodeId;
  state: MapNodeState;
  goals: Goal[];
  level: number;
  xp: number;
  busy: boolean;
  reducedMotion: boolean;
  /** Locked places: a calm pointer to where XP comes from now (map/missions.ts xpHint). */
  hint?: { text: string; place: MapNodeId };
  onClose: () => void;
  onEnter: (id: MapNodeId) => void;
  /** Opens the Missions tab filtered to a place. */
  onMissions?: (id: MapNodeId) => void;
  onDone: (goalId: string) => void;
  /** Мастерская: missions are finished with a photo (Proof sheet). */
  onProof?: (goalId: string) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sheet = placeSheet({ id, state, goals, level, xp });
  const locked = state === "locked";
  const titleId = `sheet-title-${id}`;
  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section
        className={`lx-sheet place-sheet is-${state}`}
        style={{ ["--place" as string]: `var(--lx-place-${id})` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-sheet-state={state}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lx-sheet__in">
          <div className="grab" aria-hidden="true" />
          <header className="ps-head">
            <div className="ps-hex" aria-hidden="true">
              <img className="ps-hex__frame" src={hexFrameUrl(id, locked)} width={96} height={96} alt="" />
              <img className="ps-hex__icon" src={artSrc(placeIconUrl(id, locked), reducedMotion)} width={58} height={58} alt="" />
              {state === "done" ? <img className="ps-stamp" src="/art/scene14/badges/done.svg" width={34} height={34} alt="" /> : null}
              {locked ? <img className="ps-stamp" src="/art/scene14/badges/locked.svg" width={34} height={34} alt="" /> : null}
            </div>
            <div>
              <p className="ps-meta">{sheet.meta}</p>
              <h2 id={titleId} className={sheet.title.length > 11 ? "ps-title long" : "ps-title"}>{sheet.title}</h2>
              <span className="ps-status">
                <i aria-hidden="true" />
                {sheet.status}
              </span>
              {sheet.doneOn ? <span className="ps-date">{sheet.doneOn}</span> : null}
            </div>
          </header>

          {sheet.condition ? (
            <div className="ps-cond">
              <p className="ps-label">Условие открытия</p>
              <p className="ps-cond__text" role="status">{sheet.condition.text}</p>
              <p className="ps-row"><span>Уровень</span><span>{sheet.condition.level} / {sheet.condition.needLevel}</span></p>
              <Segments lit={segments(sheet.condition.level, sheet.condition.needLevel)} tone="locked" />
              {hint ? (
                <p className="ps-hint">
                  <span>{hint.text}</span>
                  {onMissions ? (
                    <button type="button" className="quiet" onClick={() => onMissions(hint.place)}>К миссиям</button>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="ps-row ps-gap"><span>Прогресс места</span><span>{sheet.progress.done} / {sheet.progress.total}</span></p>
              <Segments lit={segments(sheet.progress.done, sheet.progress.total)} tone="place" />
            </>
          )}

          {sheet.earnedXp !== null ? (
            <div className="ps-reward">
              <img src={REWARD_ICON_URL} width={40} height={40} alt="" />
              <div>
                <p className="ps-label">Опыт получен</p>
                <p className="ps-reward__v"><b>+{sheet.earnedXp} XP</b> · {sheet.progress.done} {missionWord(sheet.progress.done)}</p>
              </div>
            </div>
          ) : null}

          <p className="ps-row ps-gap">
            <span>{state === "done" && sheet.progress.done === sheet.progress.total ? "Миссии · все пройдены" : "Миссии"}</span>
            {sheet.missionsHidden ? <span>Скрыты до открытия</span> : null}
          </p>
          {sheet.missions.length === 0 ? <p className="empty">Миссий пока нет.</p> : null}
          {state === "done" ? <p className="ps-note">Пройденные миссии повторно XP не дают.</p> : null}
          <ul className="ps-missions">
            {sheet.missions.map((mission) =>
              sheet.missionsHidden ? (
                <li key={mission.id} className="is-hidden">
                  <img src={`${UI}/ic_lock.svg`} width={20} height={20} alt="" />
                  <span className="mask" aria-label="Скрыто" />
                  <span className="xpv">+?? XP</span>
                </li>
              ) : (
                <li key={mission.id} className={mission.done ? "is-done" : undefined}>
                  <img
                    src={mission.done ? `${UI}/ic_check.svg` : MISSION_OPEN_URL}
                    width={20}
                    height={20}
                    alt={mission.done ? "Выполнена" : ""}
                  />
                  <span className="ttl">{mission.title}</span>
                  <span className="xpv">+{mission.xp} XP</span>
                  {!mission.done && id === "workshop" && onProof ? (
                    <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" disabled={busy} onClick={() => onProof(mission.id)} aria-label={`Proof: ${mission.title}`}>
                      <span className="lx-btn__in">Proof</span>
                    </button>
                  ) : !mission.done ? (
                    <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" disabled={busy} onClick={() => onDone(mission.id)} aria-label={`Выполнить: ${mission.title}`}>
                      <span className="lx-btn__in">Выполнить</span>
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ul>

          <div className="ps-actions">
            {sheet.actions.map((action, index) => {
              const primary = index === sheet.actions.length - 1;
              const disabled = primary && sheet.primaryDisabled;
              const icon = disabled ? `${UI}/ic_lock.svg` : ACTION_ICON[action];
              return (
                <button
                  key={action}
                  type="button"
                  className={primary ? "lx-btn ps-primary" : "lx-btn lx-btn--secondary ps-later"}
                  disabled={disabled}
                  onClick={action === "later" ? onClose : action === "repeat" && onMissions ? () => onMissions(id) : () => onEnter(id)}
                >
                  <span className="lx-btn__in">
                    {icon ? <img src={icon} width={18} height={18} alt="" /> : null}
                    {ACTION_LABEL[action]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function Segments({ lit, tone }: { lit: boolean[]; tone: "place" | "locked" }) {
  return (
    <div className={`ps-seg ${tone}`} aria-hidden="true">
      {lit.map((on, index) => (
        <i key={index} className={on ? "on" : undefined} />
      ))}
    </div>
  );
}

function missionWord(count: number): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "миссий";
  if (last === 1) return "миссия";
  if (last >= 2 && last <= 4) return "миссии";
  return "миссий";
}
