import type { MapNodeId, MapNodeState } from "@levex/domain";
import type { Goal } from "./api";
import { placeIconUrl } from "./map/placeIcons";
import { ACTION_LABEL, placeSheet, segments, type SheetAction } from "./map/placeSheet";
import { artSrc } from "./theme/motion";

const UI = "/art/scene14/ui";
const ACTION_ICON: Partial<Record<SheetAction, string>> = {
  start: `${UI}/ic_play.svg`,
  enter: `${UI}/ic_play.svg`,
  repeat: `${UI}/ic_replay.svg`,
};

export function PlaceSheet({
  id,
  state,
  goals,
  level,
  xp,
  busy,
  reducedMotion,
  onClose,
  onEnter,
  onDone,
}: {
  id: MapNodeId;
  state: MapNodeState;
  goals: Goal[];
  level: number;
  xp: number;
  busy: boolean;
  reducedMotion: boolean;
  onClose: () => void;
  onEnter: (id: MapNodeId) => void;
  onDone: (goalId: string) => void;
}) {
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
              <span className="ps-hex__in">
                <img src={artSrc(placeIconUrl(id, locked), reducedMotion)} width={58} height={58} alt="" />
              </span>
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
            </div>
          ) : (
            <>
              <p className="ps-row ps-gap"><span>Прогресс места</span><span>{sheet.progress.done} / {sheet.progress.total}</span></p>
              <Segments lit={segments(sheet.progress.done, sheet.progress.total)} tone="place" />
            </>
          )}

          {sheet.earnedXp !== null ? (
            <div className="ps-reward">
              <img src={`${UI}/ic_star.svg`} width={34} height={34} alt="" />
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
                    src={mission.done ? `${UI}/ic_check.svg` : "/art/scene14/badges/available.svg"}
                    width={20}
                    height={20}
                    alt={mission.done ? "Выполнена" : ""}
                  />
                  <span className="ttl">{mission.title}</span>
                  <span className="xpv">+{mission.xp} XP</span>
                  {!mission.done ? (
                    <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" disabled={busy} onClick={() => onDone(mission.id)}>
                      <span className="lx-btn__in">Готово</span>
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
                  onClick={action === "later" ? onClose : () => onEnter(id)}
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
