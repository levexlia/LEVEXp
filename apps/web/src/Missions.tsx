import { ACTIVE_OWN_MISSIONS_MAX, MAP_NODES, XP_REWARD_STANDARD, dailyLedger, xpDoneLabel, xpPromiseLabel, activeOwnCount, activeOwnLimitMessage, dailyCapHint, type LifeSphereId, type MapNodeId, type MapNodeState } from "@levex/domain";
import { useState, type FormEvent } from "react";
import type { Goal, TodayAwards } from "./api";
import { activityAid } from "./daily/activity";
import { placeIconUrl } from "./map/placeIcons";
import { MISSION_STATUS, missionBoard, placelessBoard, todayBoard, type MissionRow, type PlanChip } from "./map/missions";
import { KitIcon, SPHERE_ICON, kitIconUrl } from "./map/KitIcon";
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
  /** «Удалить» an open mission (Missions tab only). */
  onDelete?: (goal: Goal) => void;
}

/** One mission: place, title, status (доступна / выполнена) and its action. */
export function MissionItem({ row, goal, actions, reducedMotion }: { row: MissionRow; goal: Goal; actions: MissionActions; reducedMotion: boolean }) {
  const status = row.done ? MISSION_STATUS.done : MISSION_STATUS.open;
  const locked = row.done ? null : actions.lockedText?.(row) ?? null;
  const startable = !row.done && !row.proof && !locked && actions.onStart && activityAid(row.title, goal.templateId).kind !== "stopwatch";
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      className={row.done ? "mission is-done" : "mission"}
      data-mission={row.id}
      data-status={row.done ? "done" : "open"}
      style={{ ["--place" as string]: row.place ? `var(--lx-place-${row.place})` : "var(--lx-cyan)" }}
    >
      <img
        className="mission__icon"
        src={row.done ? CHECK_URL : row.place ? artSrc(placeIconUrl(row.place), reducedMotion) : row.sphere && SPHERE_ICON[row.sphere] ? kitIconUrl(SPHERE_ICON[row.sphere]!) : "/art/scene14/badges/mission_open.svg"}
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
        {!row.done && actions.onDelete ? (
          confirming ? (
            <div className="mission__confirm" role="group" aria-label={`Удалить «${row.title}»?`}>
              <span className="mission__ask">Удалить миссию?</span>
              <button type="button" className="mission__del is-danger" disabled={actions.busy} onClick={() => { setConfirming(false); actions.onDelete!(goal); }}>
                Да, удалить
              </button>
              <button type="button" className="mission__del" onClick={() => setConfirming(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <button type="button" className="mission__del" disabled={actions.busy} onClick={() => setConfirming(true)} aria-label={`Удалить: ${row.title}`}>
              <span aria-hidden="true">✕</span>Удалить
            </button>
          )
        ) : null}
      </div>
      <div className="mission__act">
        <span className="mission__xp">{row.done ? xpDoneLabel(row.noXp ? 0 : row.xp) : xpPromiseLabel(row.noXpToday, row.xp)}</span>
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
  onTemplate,
  actions,
  reducedMotion,
}: {
  goals: readonly Goal[];
  states: ReadonlyMap<MapNodeId, MapNodeState>;
  place: MapNodeId | null;
  onPlace: (place: MapNodeId | null) => void;
  onCreate: (title: string, sphere: LifeSphereId) => Promise<boolean>;
  /** Add a placeless sphere template (Карьера, Финансы, Отношения) for today. */
  onTemplate?: (templateId: string) => void;
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

      {board.later.length > 0 ? (
        <>
          <h3>Завтра</h3>
          <List rows={board.later} goals={goals} actions={actions} reducedMotion={reducedMotion} />
        </>
      ) : null}

      {place === null && onTemplate ? <Placeless goals={goals} busy={actions.busy} onTemplate={onTemplate} /> : null}

      {board.done.length > 0 ? (
        <>
          <h3>Выполнены</h3>
          <p className="missions-note">Выполненная миссия повторно XP не даёт.</p>
          <List rows={board.done} goals={goals} actions={actions} reducedMotion={reducedMotion} />
        </>
      ) : null}

      <NewMission key={place ?? "all"} states={states} place={place} busy={actions.busy} onCreate={onCreate} full={activeOwnCount(goals) >= ACTIVE_OWN_MISSIONS_MAX} />
    </section>
  );
}

/**
 * «Без места на карте»: Карьера, Финансы, Отношения have no map place yet, so their missions are added
 * here, from level 1. Each gives +10 XP under the same daily rules (one award per template a day).
 */
/** R-XP-6: today's 5/5 is used up (player day in Asia/Jerusalem). */
function dailyLedgerCapped(goals: readonly Goal[], now = new Date()): boolean {
  const ledger = dailyLedger(goals, now);
  return ledger.awarded >= ledger.awardCap;
}

function Placeless({ goals, busy, onTemplate }: { goals: readonly Goal[]; busy: boolean; onTemplate: (templateId: string) => void }) {
  const groups = placelessBoard(goals);
  const capped = dailyLedgerCapped(goals);
  return (
    <section className="placeless" aria-labelledby="placeless-title">
      <h3 id="placeless-title">Без места на карте</h3>
      <p className="missions-note" data-capped={capped || undefined}>
        {capped
          ? "Короткие дела на 5–25 минут, доступны с первого уровня. Сегодня лимит XP уже набран: дела запишутся без XP."
          : `Короткие дела на 5–25 минут, доступны с первого уровня. +${XP_REWARD_STANDARD} XP, один раз в день за каждое.`}
      </p>
      <div className="placeless__groups">
      {groups.map((group) => (
        <div key={group.sphere} className="placeless__group" data-sphere={group.sphere}>
          <h4 className="placeless__name">
            {SPHERE_ICON[group.sphere] ? <KitIcon name={SPHERE_ICON[group.sphere]!} size={18} /> : null}
            {group.name}
          </h4>
          <ul className="placeless__list">
            {group.rows.map(({ template, state }) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="placeless__add"
                  disabled={busy || state === "open"}
                  onClick={() => onTemplate(template.id)}
                  data-template={template.id}
                  aria-label={state === "open" ? `${template.title}: уже в списке` : `Добавить: ${template.title}`}
                >
                  <span className="placeless__ttl">{state === "open" ? "✓" : "+"} {template.title}</span>
                  <span className="placeless__meta">
                    ~{template.minutes} мин · {state === "open" ? "уже в списке" : xpPromiseLabel(state === "noXp", XP_REWARD_STANDARD)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      </div>
    </section>
  );
}

function NewMission({
  states,
  place,
  busy,
  onCreate,
  full = false,
}: {
  states: ReadonlyMap<MapNodeId, MapNodeState>;
  place: MapNodeId | null;
  busy: boolean;
  onCreate: (title: string, sphere: LifeSphereId) => Promise<boolean>;
  /** {@link ACTIVE_OWN_MISSIONS_MAX} open own missions already: the server would refuse (409). */
  full?: boolean;
}) {
  const open = MAP_NODES.filter((node) => (states.get(node.id) ?? "locked") !== "locked");
  const preferred = open.find((node) => node.id === place) ?? open[0] ?? MAP_NODES[0]!;
  const [title, setTitle] = useState("");
  const [nodeId, setNodeId] = useState<MapNodeId>(preferred.id);
  const chosen = open.find((node) => node.id === nodeId) ?? preferred;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || full) return;
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
      {full ? <p className="field-hint" role="status" data-own-full="true">{activeOwnLimitMessage()}</p> : null}
      <button type="submit" className="lx-btn lx-btn--secondary lx-btn--wide" disabled={busy || full || title.trim().length === 0}>
        <span className="lx-btn__in">Добавить миссию</span>
      </button>
    </form>
  );
}

/**
 * «Сегодня» beside / under the map: the same goals as the Missions tab, for today's player day.
 * An empty day shows a plan («Можно снова: …») instead of only pointing to the form (spec №1).
 */
/** Consecutive chips of the same kind form one block, so the plan keeps its order (repeats · new · repeats без XP). */
export function planBlocks(plan: readonly PlanChip[]): Array<{ kind: PlanChip["kind"]; chips: PlanChip[] }> {
  const blocks: Array<{ kind: PlanChip["kind"]; chips: PlanChip[] }> = [];
  for (const chip of plan) {
    const last = blocks.at(-1);
    if (last && last.kind === chip.kind) last.chips.push(chip);
    else blocks.push({ kind: chip.kind, chips: [chip] });
  }
  return blocks;
}

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
          <p className="empty">На сегодня дел нет.</p>
          {planBlocks(plan).map(({ kind, chips }, index) => {
            const label = kind === "repeat" ? "Можно снова:" : "Можно взять:";
            return (
              <div key={`${kind}-${index}`} className="today-plan__block" data-plan-block={kind}>
                <p className="today-plan__label">{label}</p>
                <div className="place-filter" role="group" aria-label={label}>
                  {chips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      className="lx-chip filter-chip plan-chip"
                      style={{ ["--place" as string]: chip.place ? `var(--lx-place-${chip.place})` : "var(--lx-cyan)" }}
                      disabled={actions.busy}
                      onClick={() => onPlan(chip)}
                      data-plan={chip.key}
                    >
                      <span className="lx-chip__in">+ {chip.title}{chip.noXpToday ? <small className="plan-chip__noxp"> · {xpPromiseLabel(true, 0)}</small> : null}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
