import {
  DEFAULT_AVATAR_CONFIG,
  MAP_NODES,
  NICKNAME_MAX_LENGTH,
  XP_PER_LEVEL,
  dailyLedger,
  lockedPlaceFor,
  placeLockedMessage,
  playerDay,
  shiftDay,
  templateKeyOf,
  type AvatarConfig,
  type LifeSphereId,
  type MapNodeId,
  type ReflectionFeeling,
} from "@levex/domain";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  askAssistant,
  completeGoal,
  createArtifact,
  createGoal,
  deleteGoal,
  errorMessage,
  generateAvatar,
  goalFromTemplate,
  loadRoom,
  mergePlayer,
  repeatGoal,
  saveAvatar,
  saveReflection,
  updateNickname,
  uploadImage,
  type Goal,
  type Placement,
  type Player,
} from "./api";
import { Avatar } from "./avatar/Avatar";
import { AvatarBuilder } from "./AvatarBuilder";
import { AssistantChat } from "./assistant/AssistantChat";
import { ASSISTANT_ROBOT_SIZE, ROBOT_STATES, robotSrc, type RobotState } from "./assistant/art";
import { rememberChatOpened, shouldShowTapMarker, tapMarkerSrc } from "./assistant/tapMarker";
import { HINT_TEXT, useAssistantHint } from "./assistant/hints";
import { HintBubble, hintRobotSrc } from "./assistant/HintBubble";
import { Check, PhotoPick, Toast } from "./Controls";
import { HomeMap, mapStates } from "./HomeMap";
import { EmptyState, MissionsView, TodayPanel, type MissionActions } from "./Missions";
import { PlaceSheet } from "./PlaceSheet";
import { ActivityScreen } from "./daily/ActivityScreen";
import { AfterMission, type AfterMissionInfo } from "./daily/AfterMission";
import { availableOn, planChips, placeName, placeForSphere, todayBoard, xpHint, type MissionFilter, type PlanChip } from "./map/missions";
import { segments } from "./map/placeSheet";
import { sphereRows } from "./map/resources";
import { HEX_LEVEL_URL, tabIconUrl, uiIconUrl, type HeaderIcon, type TabIcon } from "./theme/uiArt";
import { useReducedMotion } from "./theme/useReducedMotion";
import { KitIcon, SPHERE_ICON } from "./map/KitIcon";
import { Logo } from "./Logo";

type Tab = "map" | "missions" | "resources" | "profile";

/** Proof sheet: for a Workshop mission (goal) or, from the map button, a new Workshop mission. */
interface ProofTarget {
  goal: Goal | null;
}

export function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [missionPlace, setMissionPlace] = useState<MissionFilter>(null);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [nodeId, setNodeId] = useState<MapNodeId | null>(null);
  const [proof, setProof] = useState<ProofTarget | null>(null);
  /** «Начать»: the mission on the activity screen (spec №2). */
  const [activity, setActivity] = useState<Goal | null>(null);
  /** After a completion: «Повторить завтра?» + «Как прошло?» (spec №1, №3). */
  const [after, setAfter] = useState<AfterMissionInfo | null>(null);
  const closeActivity = useCallback(() => setActivity(null), []);
  const closeAfter = useCallback(() => setAfter(null), []);
  const [cheer, setCheer] = useState(false);
  const [chat, setChat] = useState(false);
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const robotRef = useRef<HTMLButtonElement>(null);
  const [tapMarker, setTapMarker] = useState(shouldShowTapMarker);
  const openChat = useCallback(() => {
    setChat(true);
    rememberChatOpened();
    setTapMarker(false);
  }, []);
  const closeChat = useCallback(() => {
    setChat(false);
    setRobotState("idle");
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  async function refresh(): Promise<{ player: Player; goals: Goal[] }> {
    const data = await loadRoom();
    setPlayer(data.player);
    setGoals(data.goals);
    setPlacements(data.placements);
    if (data.player.avatarConfig) setDraft(data.player.avatarConfig);
    return data;
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const level = player?.progress.level ?? 1;
  const xp = player?.progress.xp ?? 0;
  const into = xp % XP_PER_LEVEL;
  const config = player?.avatarConfig ?? DEFAULT_AVATAR_CONFIG;
  const energy = player?.energy ?? { current: 50, max: 50 };
  const reducedMotion = useReducedMotion();
  const states = mapStates(level, goals);
  const now = new Date();
  const plan = planChips(goals, level, now, player?.progress.xpBySphere ?? {});
  const ledger = dailyLedger(goals, now);
  // Assistant hints (scene17): only once the room is loaded, so an empty first render does not count.
  const { hint, dismiss: dismissHint } = useAssistantHint(
    {
      own_cap: player !== null && ledger.ownAwarded >= ledger.ownAwardCap,
      empty_day: player !== null && plan.length > 0 && todayBoard(goals, now).open.length === 0,
    },
    now,
  );
  const hintText = hint === "own_cap" ? HINT_TEXT.ownCap : plan.some((chip) => chip.kind === "repeat") ? HINT_TEXT.emptyDayRepeat : HINT_TEXT.emptyDayNew;
  // The bubble belongs to the map robot: not while the chat is open.
  const mapHint = hint && !chat ? hint : null;

  // Preload the robot states so switching does not flash (scene15 INTEGRATION.md).
  useEffect(() => {
    for (const state of ROBOT_STATES) new Image().src = robotSrc(state, reducedMotion);
  }, [reducedMotion]);

  function say(text: string) {
    setToast({ id: Date.now(), text });
  }

  /** Dock: switching sections leaves the builder and clears an old error. */
  function pick(next: Tab) {
    setBuilding(false);
    setError(null);
    if (next === "missions") setMissionPlace(null);
    setTab(next);
    window.scrollTo?.(0, 0);
  }

  /** Mission list of one place (the place sheet's «Миссии места», the locked hint). */
  function openMissions(id: MapNodeId | null) {
    setNodeId(null);
    setBuilding(false);
    setMissionPlace(id);
    setTab("missions");
    window.scrollTo?.(0, 0);
  }

  /**
   * «Начать» / «Войти»: Мастерская opens the photo proof. Other places open the activity screen for
   * their first open mission of today (spec №2), or their missions when there is none.
   */
  function enterPlace(id: MapNodeId) {
    if (id === "workshop" && states.get(id) !== "done") {
      setNodeId(null);
      setProof({ goal: null });
      return;
    }
    const sphere = MAP_NODES.find((node) => node.id === id)?.sphere;
    const today = playerDay(new Date());
    const next = goals.find((goal) => goal.status === "open" && goal.sphere === sphere && availableOn(goal, today));
    if (next) {
      setNodeId(null);
      setActivity(next);
    } else openMissions(id);
  }

  /** Can «Повторить завтра» make a copy? Not in a locked place, not when tomorrow already has one. */
  function canRepeat(goal: Goal, list: readonly Goal[], lvl: number): boolean {
    if (lockedPlaceFor(goal.sphere, lvl)) return false;
    const key = templateKeyOf(goal) ?? `own:${goal.id}`;
    const tomorrow = shiftDay(playerDay(new Date()), 1);
    return !list.some((item) => item.status === "open" && item.availableFrom === tomorrow && (templateKeyOf(item) ?? "") === key);
  }

  function burst() {
    setCheer(true);
    window.setTimeout(() => setCheer(false), 1600);
  }

  function gained(before: number, after: number, title: string, message?: string) {
    say(after > before ? `+${after - before} XP · «${title}» выполнена` : message ?? `«${title}» выполнена`);
    if (after > before) burst();
  }

  /** After a first completion: toast, then the short «Повторить завтра? / Как прошло?» sheet. */
  async function completed(before: number, done: Awaited<ReturnType<typeof completeGoal>>, wasOpen: boolean) {
    const data = await refresh();
    gained(before, done.progress.xp, done.goal.title, done.message);
    if (!wasOpen) return;
    setAfter({
      goal: done.goal,
      awarded: done.awarded,
      gained: Math.max(0, done.progress.xp - before),
      message: done.message,
      canRepeat: canRepeat(done.goal, data.goals, data.player.progress.level),
    });
  }

  async function finish(goalId: string) {
    setBusy(true);
    setError(null);
    try {
      const before = player?.progress.xp ?? 0;
      const wasOpen = goals.find((goal) => goal.id === goalId)?.status !== "done";
      const done = await completeGoal(goalId);
      setActivity(null);
      await completed(before, done, wasOpen);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addMission(title: string, sphere: LifeSphereId): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const goal = await createGoal(title, sphere);
      await refresh();
      say(`Миссия «${goal.title}» добавлена`);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendProof(target: ProofTarget, caption: string, file: File) {
    setBusy(true);
    setError(null);
    try {
      const before = player?.progress.xp ?? 0;
      const title = caption || target.goal?.title || "Фото";
      // A Workshop mission gets the photo linked; the map button makes a new Workshop mission, as before.
      const goal = target.goal ?? (await createGoal(title, "creativity"));
      const url = await uploadImage(file);
      await createArtifact({ title, imageUrl: url, goalId: goal.id });
      const done = await completeGoal(goal.id);
      setProof(null);
      await completed(before, done, goal.status !== "done");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** «Да, на завтра»: a copy of the goal for the next player day (R-XP-9). */
  async function repeatTomorrow(goalId: string): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const copy = await repeatGoal(goalId, true);
      await refresh();
      return copy.id;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** «Удалить» an open mission, or «Отменить» tomorrow's copy. XP does not change. */
  async function removeGoal(goalId: string, note?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await deleteGoal(goalId);
      await refresh();
      if (note) say(note);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reflect(goalId: string, felt: ReflectionFeeling, note: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await saveReflection(goalId, felt, note);
      await refresh();
      say("Сохранено. На XP это не влияет.");
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Empty-day plan chip: a copy of a template for today. */
  async function addFromPlan(chip: PlanChip) {
    setBusy(true);
    setError(null);
    try {
      const goal = chip.repeatOf ? await repeatGoal(chip.repeatOf, false) : await goalFromTemplate(chip.templateId!);
      await refresh();
      say(`Миссия «${goal.title}» на сегодня`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const workshopLocked = states.get("workshop") === "locked";
  const actions: MissionActions = {
    busy,
    onDone: finish,
    onProof: (goal) => setProof({ goal }),
    onStart: (goal) => setActivity(goal),
    lockedText: (row) => {
      const node = row.place ? MAP_NODES.find((item) => item.id === row.place) : undefined;
      return node && states.get(node.id) === "locked" ? placeLockedMessage(node) : null;
    },
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Logo />
          <strong>LEVEX</strong>
        </div>
        <div className="meters">
          <span className="cnt streak" title="Серия"><UiIcon name="streak" />{pad2(player?.streak ?? 0)}<small>Серия</small></span>
          <span className="cnt energy" title="Энергия"><UiIcon name="energy" />{energy.current}/{energy.max}</span>
          <span className="lvl">Уровень<span className="lvl-hex"><img src={HEX_LEVEL_URL} width={40} height={40} alt="" /><b>{pad2(level)}</b></span></span>
        </div>
        <div className="xp-line">
          <em>XP</em>
          <div className="xp-seg" role="progressbar" aria-label="XP до следующего уровня" aria-valuenow={into} aria-valuemin={0} aria-valuemax={XP_PER_LEVEL}>
            {segments(into, XP_PER_LEVEL, 20).map((on, index) => <i key={index} className={on ? "on" : undefined} />)}
          </div>
          <em>{into}/{XP_PER_LEVEL}</em>
        </div>
      </header>

      <main>
        {error ? (
          <p className="banner bad" role="alert">
            {error}
            <button type="button" className="quiet" onClick={() => setError(null)}>Скрыть</button>
          </p>
        ) : null}
        {building ? (
          <section className="builder-page" aria-labelledby="builder-head">
            <header className="page-head">
              <button
                type="button"
                className="lx-btn lx-btn--secondary lx-btn--sm"
                onClick={() => { setDraft(config); setBuilding(false); }}
              >
                <span className="lx-btn__in">← Назад</span>
              </button>
              <h2 id="builder-head">Собрать персонажа</h2>
            </header>
            <AvatarBuilder
              value={draft}
              busy={busy}
              onChange={setDraft}
              onDone={async () => {
                setBusy(true);
                setError(null);
                try {
                  const saved = await saveAvatar(draft);
                  setPlayer((previous) => mergePlayer(previous, saved));
                  setBuilding(false);
                  say("Персонаж сохранён");
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
              extra={
                <PhotoLook
                  busy={busy}
                  onLook={async (file, consent) => {
                    setBusy(true);
                    setError(null);
                    try {
                      const result = await generateAvatar(file, consent, false);
                      const look = result.looks?.[0];
                      if (!look) {
                        setError("Не удалось прочитать черты по фото");
                        return;
                      }
                      setDraft(look);
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              }
            />
          </section>
        ) : null}
        {!building && tab === "map" ? (
          <div className="map-wrap">
            <div className="map-column">
              <div className="map-frame">
                <HomeMap states={states} reducedMotion={reducedMotion} onOpen={setNodeId} />
                {/* Only the scene15 assistant stands on the map; the player's avatar lives in Профиль. */}
                <button
                  ref={robotRef}
                  type="button"
                  className="map-robot"
                  onClick={openChat}
                  aria-label="ИИ-помощник: открыть чат"
                  aria-haspopup="dialog"
                  aria-expanded={chat}
                >
                  <img
                    src={mapHint ? hintRobotSrc(reducedMotion) : robotSrc(chat ? robotState : "idle", reducedMotion)}
                    alt=""
                    width={ASSISTANT_ROBOT_SIZE.width}
                    height={ASSISTANT_ROBOT_SIZE.height}
                    data-state={mapHint ? "hint" : chat ? robotState : "idle"}
                  />
                  {/* scene17: the «нажми» marker hides while the bubble is visible. */}
                  {tapMarker && !mapHint ? (
                    <img
                      className="map-robot__marker"
                      src={tapMarkerSrc(reducedMotion)}
                      alt=""
                      width={34}
                      height={34}
                    />
                  ) : null}
                </button>
                {mapHint ? <HintBubble key={mapHint} id={mapHint} text={hintText} onDismiss={dismissHint} /> : null}
              </div>

              <div className="proof-row">
                <button type="button" className="lx-btn proof" onClick={() => setProof({ goal: null })}>
                  <span className="lx-btn__in"><UiIcon name="camera" />Proof</span>
                </button>
              </div>
            </div>
            <TodayPanel
              goals={goals}
              streak={player?.streak ?? 0}
              streakWord={dayWord(player?.streak ?? 0)}
              now={new Date()}
              actions={actions}
              reducedMotion={reducedMotion}
              onAll={() => openMissions(null)}
              plan={plan}
              today={player?.today}
              onPlan={addFromPlan}
            />
          </div>
        ) : null}
        {!building && tab === "missions" ? (
          <MissionsView
            goals={goals}
            states={states}
            place={missionPlace}
            onPlace={setMissionPlace}
            onCreate={addMission}
            onTemplate={(templateId) => void addFromPlan({ key: templateId, title: "", place: null, kind: "new", templateId })}
            actions={{ ...actions, onDelete: (goal) => void removeGoal(goal.id, `Миссия «${goal.title}» удалена`) }}
            reducedMotion={reducedMotion}
          />
        ) : null}
        {!building && tab === "resources" ? <Resources player={player} reducedMotion={reducedMotion} /> : null}
        {!building && tab === "profile" ? (
          <Profile
            player={player}
            config={config}
            cheer={cheer && !reducedMotion}
            placements={placements}
            busy={busy}
            onEdit={() => { setDraft(config); setBuilding(true); }}
            onRename={async (nickname) => {
              setBusy(true);
              setError(null);
              try {
                const saved = await updateNickname(nickname);
                setPlayer((previous) => mergePlayer(previous, saved));
                say("Ник сохранён");
                return true;
              } catch (err) {
                setError(errorMessage(err));
                return false;
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </main>

      <nav className="dock" aria-label="Разделы">
        <Dock id="map" tab={tab} label="Карта" icon="map" onPick={pick} />
        <Dock id="missions" tab={tab} label="Миссии" icon="missions" onPick={pick} />
        <Dock id="resources" tab={tab} label="Ресурсы" icon="resources" onPick={pick} />
        <Dock id="profile" tab={tab} label="Профиль" icon="profile" onPick={pick} />
      </nav>

      <Toast toast={toast} onDone={hideToast} />

      {nodeId ? (
        <PlaceSheet
          id={nodeId}
          state={states.get(nodeId) ?? "locked"}
          goals={goals}
          level={level}
          xp={xp}
          busy={busy}
          reducedMotion={reducedMotion}
          hint={xpHint(states, goals)}
          onClose={() => setNodeId(null)}
          onEnter={enterPlace}
          onMissions={openMissions}
          onDone={finish}
          onProof={(goalId) => {
            setNodeId(null);
            setProof({ goal: goals.find((goal) => goal.id === goalId) ?? null });
          }}
        />
      ) : null}

      {chat ? (
        <AssistantChat
          ask={askAssistant}
          onClose={closeChat}
          errorText={errorMessage}
          returnFocus={robotRef}
          onRobotState={setRobotState}
          reducedMotion={reducedMotion}
        />
      ) : null}

      {proof ? (
        <Sheet title="Proof: фото к миссии" onClose={() => setProof(null)}>
          {workshopLocked ? (
            // R-XP-8: no upload while Мастерская is locked; the server would refuse it too.
            <div data-proof-locked="true">
              <p className="proof-what">{PROOF_WHAT}</p>
              <p className="proof-locked" role="status">
                {placeLockedMessage(MAP_NODES.find((node) => node.id === "workshop")!)}. Тогда здесь можно будет прикрепить фото к миссии.
              </p>
              <button type="button" className="lx-btn lx-btn--secondary lx-btn--wide" onClick={() => { setProof(null); openMissions(null); }}>
                <span className="lx-btn__in">К миссиям</span>
              </button>
            </div>
          ) : (
            <ProofForm busy={busy} goal={proof.goal} error={error} onSubmit={(caption, file) => sendProof(proof, caption, file)} />
          )}
        </Sheet>
      ) : null}

      {activity ? (
        <ActivityScreen goal={activity} busy={busy} reducedMotion={reducedMotion} onDone={finish} onClose={closeActivity} />
      ) : null}

      {after ? (
        <AfterMission
          key={after.goal.id}
          info={after}
          busy={busy}
          onRepeat={repeatTomorrow}
          onUndoRepeat={(copyId) => removeGoal(copyId)}
          onReflect={reflect}
          onClose={closeAfter}
        />
      ) : null}
    </div>
  );
}

/** One gender-neutral line on what Proof is (playtest 24.11). */
export const PROOF_WHAT = "Proof — фото того, что сделано своими руками. Оно попадёт в галерею.";

function dayWord(count: number): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function Dock({ id, tab, label, icon, onPick }: { id: Tab; tab: Tab; label: string; icon: TabIcon; onPick: (id: Tab) => void }) {
  return (
    <button type="button" className={tab === id ? "dock-btn on" : "dock-btn"} aria-current={tab === id ? "page" : undefined} onClick={() => onPick(id)}>
      <img className="ui-icon" src={tabIconUrl(icon, tab === id)} width={26} height={26} alt="" />
      <span>{label}</span>
    </button>
  );
}

/** A scene14 header / button icon, drawn in its own colour (see theme/uiArt.ts). */
function UiIcon({ name, size = 20 }: { name: HeaderIcon; size?: number }) {
  return <img className="ui-icon" src={uiIconUrl(name)} width={size} height={size} alt="" />;
}

function pad2(value: number): string {
  return String(Math.max(0, value)).padStart(2, "0");
}

function Resources({ player, reducedMotion }: { player: Player | null; reducedMotion: boolean }) {
  const rows = sphereRows(player?.progress.xpBySphere ?? {}, player?.progress.level ?? 1);
  const empty = rows.every((row) => row.zero);
  return (
    <section className="panel">
      <h2>Ресурсы</h2>
      {empty ? <EmptyState kind="resources" art="empty_resources" line="Сферы заполнятся после первой миссии." reducedMotion={reducedMotion} /> : null}
      <p className="empty">XP по сферам: за каждую выполненную миссию с начислением.</p>
      <ul className="bars">
        {rows.map((row) => (
          <li key={row.id} className={row.zero ? "is-zero" : undefined} data-sphere={row.id}>
            <span className="sphere-name">
              {SPHERE_ICON[row.id] ? <KitIcon name={SPHERE_ICON[row.id]!} size={18} /> : null}
              {row.name}
            </span>
            <i><b style={{ width: `${Math.min(100, row.xp)}%` }} /></i>
            <strong>{row.xp}</strong>
            {row.hint ? <small className="bars__hint">{row.hint}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Profile({
  player,
  config,
  cheer,
  placements,
  busy,
  onEdit,
  onRename,
}: {
  player: Player | null;
  config: AvatarConfig;
  cheer: boolean;
  placements: Placement[];
  busy: boolean;
  onEdit: () => void;
  onRename: (nickname: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="panel profile">
      <h2>Профиль</h2>
      <div className="profile-hero">
        <div className="profile-avatar">
          <Avatar config={config} cheer={cheer} title="Мой персонаж" />
        </div>
        <div className="profile-id">
          {editing ? (
            <NicknameForm
              value={player?.nickname ?? ""}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={async (nickname) => {
                if (await onRename(nickname)) setEditing(false);
              }}
            />
          ) : (
            <>
              <strong>{player?.nickname ?? "Игрок"}</strong>
              <button type="button" className="quiet rename" onClick={() => setEditing(true)}>Сменить ник</button>
            </>
          )}
          {player?.title ? <span>{player.title}</span> : null}
          <span>Уровень {player?.progress.level ?? 1}</span>
          <button type="button" className="lx-btn" onClick={onEdit}><span className="lx-btn__in">Собрать персонажа</span></button>
        </div>
      </div>
      <h3>Галерея</h3>
      {placements.length === 0 ? (
        <div className="empty-state" data-empty="gallery">
          <p>Галерея пока пуста.</p>
          <p className="empty">
            Здесь будут фото из Proof — того, что сделано своими руками.
            {(player?.progress.level ?? 1) >= 2 ? " Proof — кнопка на карте." : " Proof открывается вместе с Мастерской на уровне 2."}
          </p>
        </div>
      ) : null}
      <ul className="gallery">
        {placements.map((placement) => (
          <li key={placement.artifactId}>
            {placement.artifact.imageUrl ? <img src={placement.artifact.imageUrl} alt={placement.artifact.title} /> : <span className="gallery__none">Без фото</span>}
            <em title={placement.artifact.title}>{placement.artifact.title}</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nickname: 1–32 characters after trimming (NICKNAME_MAX_LENGTH), checked here and by PATCH /player. */
export function nicknameError(value: string): string | null {
  const text = value.trim();
  if (text.length === 0) return "Введи ник";
  if (text.length > NICKNAME_MAX_LENGTH) return `Не длиннее ${NICKNAME_MAX_LENGTH} символов`;
  return null;
}

function NicknameForm({ value, busy, onSave, onCancel }: { value: string; busy: boolean; onSave: (nickname: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const problem = nicknameError(text);
  return (
    <form
      className="nick-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) onSave(text.trim());
      }}
    >
      <label className="lx-field">
        <span>Ник</span>
        <input
          value={text}
          autoFocus
          maxLength={NICKNAME_MAX_LENGTH + 8}
          aria-invalid={problem ? true : undefined}
          aria-describedby="nick-hint"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p id="nick-hint" className={problem ? "field-hint bad" : "field-hint"}>{problem ?? `До ${NICKNAME_MAX_LENGTH} символов`}</p>
      <div className="nick-actions">
        <button type="submit" className="lx-btn lx-btn--sm" disabled={busy || problem !== null}><span className="lx-btn__in">Сохранить</span></button>
        <button type="button" className="quiet" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section className="lx-sheet sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="lx-sheet__in">
          <header>
            <h2>{title}</h2>
            <button type="button" className="quiet" onClick={onClose}>Закрыть</button>
          </header>
          {children}
        </div>
      </section>
    </div>
  );
}

function ProofForm({
  busy,
  goal,
  error,
  onSubmit,
}: {
  busy: boolean;
  goal: Goal | null;
  error: string | null;
  onSubmit: (caption: string, file: File) => void;
}) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    onSubmit(caption.trim(), file);
  }
  const place = placeName(placeForSphere(goal?.sphere ?? "creativity"));
  return (
    <form onSubmit={submit}>
      <p className="proof-what">{PROOF_WHAT}</p>
      <p className="proof-for" data-proof-goal={goal?.id ?? "new"}>
        {goal ? (
          <>Миссия: <b>«{goal.title}»</b> · {place}</>
        ) : (
          <>Новая миссия в месте «{place}»: подпись станет её названием.</>
        )}
      </p>
      {error ? <p className="banner bad" role="alert">{error}</p> : null}
      <label className="lx-field">
        <span>Подпись</span>
        <input value={caption} placeholder={goal ? goal.title : "Например: Тёплый свет"} maxLength={200} onChange={(event) => setCaption(event.target.value)} />
      </label>
      <p className="field-label">Фото</p>
      <PhotoPick file={file} onFile={setFile} />
      <button type="submit" className="lx-btn lx-btn--wide" disabled={busy || !file}><span className="lx-btn__in">Повесить и закрыть</span></button>
    </form>
  );
}

function PhotoLook({
  busy,
  onLook,
}: {
  busy: boolean;
  onLook: (file: File, consent: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      id="look-form"
      className="look-form"
      aria-labelledby="look-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (file && consent) onLook(file, true);
      }}
    >
      <h3 id="look-title">Персонаж по фото</h3>
      <Check checked={consent} onChange={setConsent}>На фото реальный человек, и я соглашаюсь создать по нему персонажа.</Check>
      <PhotoPick file={file} onFile={setFile} />
      <button type="submit" className="lx-btn lx-btn--secondary lx-btn--wide" disabled={busy || !file || !consent}><span className="lx-btn__in">Создать по фото</span></button>
    </form>
  );
}
