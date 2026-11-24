import { MAP_NODES, type LifeSphereId, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useState, type FormEvent } from "react";
import type { Goal } from "./api";
import { placeIconUrl } from "./map/placeIcons";
import { MISSION_STATUS, missionBoard, todayBoard, type MissionRow } from "./map/missions";
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
}

/** One mission: place, title, status (доступна / выполнена) and its action. */
export function MissionItem({ row, goal, actions, reducedMotion }: { row: MissionRow; goal: Goal; actions: MissionActions; reducedMotion: boolean }) {
  const status = row.done ? MISSION_STATUS.done : MISSION_STATUS.open;
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
        </span>
      </div>
      <div className="mission__act">
        <span className="mission__xp">{row.done ? `+${row.xp} XP получено` : `+${row.xp} XP`}</span>
        {row.done ? null : row.proof ? (
          <button type="button" className="lx-btn lx-btn--sm" disabled={actions.busy} onClick={() => actions.onProof(goal)} aria-label={`Proof: ${row.title}`}>
            <span className="lx-btn__in"><img src={uiIconUrl("camera")} width={16} height={16} alt="" />Proof</span>
          </button>
        ) : (
          <button type="button" className="lx-btn lx-btn--sm" disabled={actions.busy} onClick={() => actions.onDone(row.id)} aria-label={`Выполнить: ${row.title}`}>
            <span className="lx-btn__in">Выполнить</span>
          </button>
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

/** «Сегодня» beside / under the map: the same goals as the Missions tab. */
export function TodayPanel({
  goals,
  streak,
  streakWord,
  now,
  actions,
  reducedMotion,
  onAll,
}: {
  goals: readonly Goal[];
  streak: number;
  streakWord: string;
  now: Date;
  actions: MissionActions;
  reducedMotion: boolean;
  onAll: () => void;
}) {
  const today = todayBoard(goals, now);
  return (
    <aside className="stage-side" aria-labelledby="today-title">
      <h2 id="today-title">Сегодня</h2>
      <p className="streak-line"><img className="ui-icon" src={uiIconUrl("streak")} width={20} height={20} alt="" /> Серия: {streak} {streakWord}</p>
      <p className="today-sum">Выполнено сегодня: <b>{today.doneToday}</b> · Доступно: <b>{today.openTotal}</b></p>
      {today.open.length > 0 ? (
        <List rows={today.open} goals={goals} actions={actions} reducedMotion={reducedMotion} />
      ) : (
        <p className="empty" data-empty="today">
          {goals.length === 0 ? "Миссий пока нет. Добавь первую во вкладке «Миссии»." : "Все миссии выполнены. Новую можно добавить во вкладке «Миссии»."}
        </p>
      )}
      <button type="button" className="quiet today-all" onClick={onAll}>Все миссии</button>
    </aside>
  );
}
