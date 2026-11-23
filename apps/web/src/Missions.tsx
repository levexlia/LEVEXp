import { MAP_NODES, dailyCapHint, type LifeSphereId, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useState, type FormEvent } from "react";
import type { Goal, TodayAwards } from "./api";
import { activityAid } from "./daily/activity";
import { placeIconUrl } from "./map/placeIcons";
import { MISSION_STATUS, missionBoard, todayBoard, type MissionRow, type PlanChip } from "./map/missions";
import { artSrc } from "./theme/motion";
import { uiIconUrl } from "./theme/uiArt";

const CHECK_URL = "/art/scene14/ui/ic_check.svg";
export const MISSION_TITLE_MAX = 120;

export interface MissionActions {
  busy: boolean;
  /** Mark an open mission done (POST /goals/:id/complete). */
  onDone: (goalId: string) => void;
  /** Open the Proof sheet for a Workshop mission. */
  onProof: (goal: Goal) => void;
  /** «Начать»: the activity screen with an optional timer / page counter (spec №2). */
  onStart?: (goal: Goal) => void;
  /** R-XP-8: the place of this row is locked, so Proof / «Выполнить» would be refused. */
  lockedText?: (row: MissionRow) => string | null;
}

/** One mission: place, title, status (доступна / выполнена) and its action. */
export function MissionItem({ row, goal, actions, reducedMotion }: { row: MissionRow; goal: Goal; actions: MissionActions; reducedMotion: boolean }) {
  const status = row.done ? MISSION_STATUS.done : MISSION_STATUS.open;
  const locked = row.done ? null : actions.lockedText?.(row) ?? null;
  const startable = !row.done && !row.proof && !locked && actions.onStart && activityAid(row.title).kind !== "stopwatch";
  return (
    <li
      className={row.done ? "mission is-done" : "mission"}
      data-mission={row.id}
      data-status={row.done ? "done" : "open"}
      style={{ ["--place" as string]: row.place ? `var(--lx-place-${row.place})` : "var(--lx-cyan)" }}
    >
      <img
        className="mission__icon"
        src={row.done ? CHECK_URL : row.place ? artSrc(placeIconUrl(row.place), reducedMotion) : "/art/scene14/badges/mission_open.svg"}
        width={24}
        height={24}
        alt=""
      />
      <div className="mission__body">
        <span className="mission__ttl">{row.title}</span>
        <span className="mission__meta">
          {row.placeName} · <b className="mission__st">{status}</b>
          {row.doneOn ? ` · ${row.doneOn}` : null}
          {row.from ? ` · с ${row.from}` : null}
        </span>
        {row.reflection ? <span className="mission__refl">{row.reflection}</span> : null}
        {locked ? <span className="mission__refl">{locked}</span> : null}
      </div>
      <div className="mission__act">
        <span className="mission__xp">{row.done ? (row.noXp ? "без XP · записано" : `+${row.xp} XP получено`) : `+${row.xp} XP`}</span>
        {row.done ? null : locked ? (
          <button type="button" className="lx-btn lx-btn--sm" disabled aria-label={`${locked}: ${row.title}`}>
            <span className="lx-btn__in"><img src="/art/scene14/ui/ic_lock.svg" width={14} height={14} alt="" />Закрыто</span>
          </button>
        ) : row.proof ? (
          <button type="button" className="lx-btn lx-btn--sm" disabled={actions.busy} onClick={() => actions.onProof(goal)} aria-label={`Proof: ${row.title}`}>
            <span className="lx-btn__in"><img src={uiIconUrl("camera")} width={16} height={16} alt="" />Proof</span>
          </button>
        ) : (
          <span className="mission__btns">
            {startable ? (
              <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" disabled={actions.busy} onClick={() => actions.onStart!(goal)} aria-label={`Начать: ${row.title}`}>
                <span className="lx-btn__in">Начать</span>
              </button>
            ) : null}
            <button type="button" className="lx-btn lx-btn--sm" disabled={actions.busy} onClick={() => actions.onDone(row.id)} aria-label={`Выполнить: ${row.title}`}>
              <span className="lx-btn__in">Выполнить</span>
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function List({ rows, goals, actions, reducedMotion }: { rows: MissionRow[]; goals: readonly Goal[]; actions: MissionActions; reducedMotion: boolean }) {
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  return (
    <ul className="missions">
      {rows.map((row) => (
        <MissionItem key={row.id} row={row} goal={byId.get(row.id)!} actions={actions} reducedMotion={reducedMotion} />
      ))}
    </ul>
  );
}

/** Вкладка «Миссии»: filter by place, open missions with their action, done ones, and a form for a new one. */
export function MissionsView({
  goals,
  states,
  place,
  onPlace,
  onCreate,
  actions,
  reducedMotion,
}: {
  goals: readonly Goal[];
  states: ReadonlyMap<MapNodeId, MapNodeState>;
  place: MapNodeId | null;
  onPlace: (place: MapNodeId | null) => void;
  onCreate: (title: string, sphere: LifeSphereId) => Promise<boolean>;
  actions: MissionActions;
  reducedMotion: boolean;
}) {
  const board = missionBoard(goals, place);
  const placeLabel = MAP_NODES.find((node) => node.id === place)?.name;
  return (
    <section className="panel missions-view" aria-labelledby="missions-title">
      <h2 id="missions-title">Миссии</h2>
      <p className="missions-sum" role="status">
        Доступно: <b>{board.total.open}</b> · Выполнено: <b>{board.total.done}</b>
      </p>
      <div className="place-filter" role="group" aria-label="Место">
        <button type="button" className="lx-chip filter-chip" aria-pressed={place === null} onClick={() => onPlace(null)}>
          <span className="lx-chip__in">Все</span>
        </button>
        {MAP_NODES.map((node) => (
          <button
            key={node.id}
            type="button"
            className={(states.get(node.id) ?? "locked") === "locked" ? "lx-chip filter-chip is-locked" : "lx-chip filter-chip"}
            style={{ ["--place" as string]: `var(--lx-place-${node.id})` }}
            aria-pressed={place === node.id}
            onClick={() => onPlace(node.id)}
          >
            <span className="lx-chip__in">{node.name}</span>
          </button>
        ))}
      </div>

      <h3>Доступны</h3>
      {board.open.length > 0 ? (
        <List rows={board.open} goals={goals} actions={actions} reducedMotion={reducedMotion} />
      ) : (
        <p className="empty" data-empty="open">
          {board.done.length > 0
            ? `Все миссии${placeLabel ? ` места «${placeLabel}»` : ""} выполнены. Добавь новую ниже.`
            : `${placeLabel ? `В месте «${placeLabel}» миссий` : "Миссий"} пока нет. Добавь первую ниже.`}
        </p>
      )}

      {board.done.length > 0 ? (
        <>
          <h3>Выполнены</h3>
          <p className="missions-note">Выполненная миссия повторно XP не даёт.</p>
          <List rows={board.done} goals={goals} actions={actions} reducedMotion={reducedMotion} />
        </>
      ) : null}

      <NewMission key={place ?? "all"} states={states} place={place} busy={actions.busy} onCreate={onCreate} />
    </section>
  );
}

function NewMission({
  states,
  place,
  busy,
  onCreate,
}: {
  states: ReadonlyMap<MapNodeId, MapNodeState>;
  place: MapNodeId | null;
  busy: boolean;
  onCreate: (title: string, sphere: LifeSphereId) => Promise<boolean>;
}) {
  const open = MAP_NODES.filter((node) => (states.get(node.id) ?? "locked") !== "locked");
  const preferred = open.find((node) => node.id === place) ?? open[0] ?? MAP_NODES[0]!;
  const [title, setTitle] = useState("");
  const [nodeId, setNodeId] = useState<MapNodeId>(preferred.id);
  const chosen = open.find((node) => node.id === nodeId) ?? preferred;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    if (await onCreate(clean, chosen.sphere)) setTitle("");
  }
  return (
    <form className="new-mission" onSubmit={submit} aria-labelledby="new-mission-title">
      <h3 id="new-mission-title">Новая миссия</h3>
      <label className="lx-field">
        <span>Что сделать</span>
        <input
          value={title}
          maxLength={MISSION_TITLE_MAX}
          placeholder="Например: Зарядка 10 мин"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="lx-field">
        <span>Место</span>
        <select value={chosen.id} onChange={(event) => setNodeId(event.target.value as MapNodeId)}>
          {open.map((node) => (
            <option key={node.id} value={node.id}>{node.name}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="lx-btn lx-btn--secondary lx-btn--wide" disabled={busy || title.trim().length === 0}>
        <span className="lx-btn__in">Добавить миссию</span>
      </button>
    </form>
  );
}

/**
 * «Сегодня» beside / under the map: the same goals as the Missions tab, for today's player day.
 * An empty day shows a plan («Можно снова: …») instead of only pointing to the form (spec №1).
 */
export function TodayPanel({
  goals,
  streak,
  streakWord,
  now,
  actions,
  reducedMotion,
  onAll,
  plan = [],
  today: awards,
  onPlan,
}: {
  goals: readonly Goal[];
  streak: number;
  streakWord: string;
  now: Date;
  actions: MissionActions;
  reducedMotion: boolean;
  onAll: () => void;
  /** Chips for an empty day (map/missions.ts planChips). */
  plan?: readonly PlanChip[];
  /** Today's XP count from the server, for the calm cap hint. */
  today?: TodayAwards;
  onPlan?: (chip: PlanChip) => void;
}) {
  const today = todayBoard(goals, now);
  const capped = awards ? awards.awarded >= awards.awardCap : false;
  return (
    <aside className="stage-side" aria-labelledby="today-title">
      <h2 id="today-title">Сегодня</h2>
      <p className="streak-line"><img className="ui-icon" src={uiIconUrl("streak")} width={20} height={20} alt="" /> Серия: {streak} {streakWord}</p>
      <p className="today-sum">
        Выполнено сегодня: <b>{today.doneToday}</b> · Доступно: <b>{today.openTotal}</b>
        {awards ? <> · XP-начислений: <b>{awards.awarded}/{awards.awardCap}</b></> : null}
      </p>
      {capped && awards ? <p className="today-cap" role="status">{dailyCapHint(awards.awardCap)}</p> : null}
      {today.open.length > 0 ? (
        <List rows={today.open} goals={goals} actions={actions} reducedMotion={reducedMotion} />
      ) : plan.length > 0 && onPlan ? (
        <div className="today-plan" data-empty="today">
          <p className="empty">На сегодня дел нет. Можно снова:</p>
          <div className="place-filter">
            {plan.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="lx-chip filter-chip plan-chip"
                style={{ ["--place" as string]: chip.place ? `var(--lx-place-${chip.place})` : "var(--lx-cyan)" }}
                disabled={actions.busy}
                onClick={() => onPlan(chip)}
                data-plan={chip.key}
              >
                <span className="lx-chip__in">+ {chip.title}</span>
              </button>
            ))}
          </div>
          <p className="field-hint">Отдых тоже нормален.</p>
        </div>
      ) : (
        <p className="empty" data-empty="today">
          {goals.length === 0 ? "Миссий пока нет. Добавь первую во вкладке «Миссии»." : "Все миссии выполнены. Новую можно добавить во вкладке «Миссии»."}
        </p>
      )}
      {today.later.length > 0 ? (
        <p className="today-later">Завтра: {today.later.map((row) => `«${row.title}»`).join(", ")}</p>
      ) : null}
      <button type="button" className="quiet today-all" onClick={onAll}>Все миссии</button>
    </aside>
  );
}
