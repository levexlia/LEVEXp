import { DEFAULT_AVATAR_CONFIG, LIFE_SPHERES, XP_PER_LEVEL, type AvatarConfig, type MapNodeId } from "@levex/domain";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  askAssistant,
  completeGoal,
  createArtifact,
  createGoal,
  errorMessage,
  generateAvatar,
  loadRoom,
  saveAvatar,
  uploadImage,
  type Goal,
  type Placement,
  type Player,
} from "./api";
import { Avatar } from "./avatar/Avatar";
import { AvatarBuilder } from "./AvatarBuilder";
import { AssistantChat } from "./assistant/AssistantChat";
import { ASSISTANT_ROBOT_SIZE, ROBOT_STATES, robotSrc, type RobotState } from "./assistant/art";
import { HomeMap, mapStates } from "./HomeMap";
import { PlaceSheet } from "./PlaceSheet";
import { segments } from "./map/placeSheet";
import { HEX_LEVEL_URL, tabIconUrl, uiIconUrl, type HeaderIcon, type TabIcon } from "./theme/uiArt";
import { useReducedMotion } from "./theme/useReducedMotion";
import { KitIcon, SPHERE_ICON } from "./map/KitIcon";
import { Logo } from "./Logo";

type Tab = "map" | "missions" | "resources" | "profile";

export function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [nodeId, setNodeId] = useState<MapNodeId | null>(null);
  const [proof, setProof] = useState(false);
  const [cheer, setCheer] = useState(false);
  const [chat, setChat] = useState(false);
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const robotRef = useRef<HTMLButtonElement>(null);
  const closeChat = useCallback(() => {
    setChat(false);
    setRobotState("idle");
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(): Promise<Player> {
    const data = await loadRoom();
    setPlayer(data.player);
    setGoals(data.goals);
    setPlacements(data.placements);
    if (data.player.avatarConfig) setDraft(data.player.avatarConfig);
    return data.player;
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

  // Preload the robot states so switching does not flash (scene15 INTEGRATION.md).
  useEffect(() => {
    for (const state of ROBOT_STATES) new Image().src = robotSrc(state, reducedMotion);
  }, [reducedMotion]);

  /** «Начать» / «Войти» / «Повторить»: Мастерская opens the photo proof, other places the mission list. */
  function enterPlace(id: MapNodeId) {
    setNodeId(null);
    if (id === "workshop") setProof(true);
    else setTab("missions");
  }

  function burst() {
    setCheer(true);
    window.setTimeout(() => setCheer(false), 1600);
  }

  async function finish(goalId: string) {
    setBusy(true);
    setError(null);
    try {
      const before = player?.progress.xp ?? 0;
      const done = await completeGoal(goalId);
      await refresh();
      if (done.progress.xp > before) {
        setNotice(`+${done.progress.xp - before} XP`);
        burst();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

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
        {error ? <p className="banner bad" role="alert">{error}</p> : null}
        {notice ? <p className="banner good" role="status">{notice}</p> : null}
        {tab === "map" ? (
          <div className="map-wrap">
            <div className="map-column">
              <div className="map-frame">
                <HomeMap states={states} reducedMotion={reducedMotion} onOpen={setNodeId} />
                {/* Only the scene15 assistant stands on the map; the player's avatar lives in Профиль. */}
                <button
                  ref={robotRef}
                  type="button"
                  className="map-robot"
                  onClick={() => setChat(true)}
                  aria-label="ИИ-помощник: открыть чат"
                  aria-haspopup="dialog"
                  aria-expanded={chat}
                >
                  <img
                    src={robotSrc(chat ? robotState : "idle", reducedMotion)}
                    alt=""
                    width={ASSISTANT_ROBOT_SIZE.width}
                    height={ASSISTANT_ROBOT_SIZE.height}
                    data-state={chat ? robotState : "idle"}
                  />
                </button>
              </div>

              <div className="proof-row">
                <button type="button" className="lx-btn proof" onClick={() => setProof(true)}>
                  <span className="lx-btn__in"><UiIcon name="camera" />Proof</span>
                </button>
              </div>
            </div>
            <aside className="stage-side" aria-labelledby="today-title">
              <h2 id="today-title">Сегодня</h2>
              <p className="streak-line"><UiIcon name="streak" /> Серия: {player?.streak ?? 0} {dayWord(player?.streak ?? 0)}</p>
              <GoalList goals={goals.filter((goal) => goal.status === "open")} busy={busy} onDone={finish} />
            </aside>
          </div>
        ) : null}
        {tab === "missions" ? (
          <GoalList goals={goals} busy={busy} onDone={finish} />
        ) : null}
        {tab === "resources" ? <Resources player={player} /> : null}
        {tab === "profile" ? (
          <Profile
            player={player}
            config={config}
            cheer={cheer && !reducedMotion}
            placements={placements}
            onEdit={() => { setDraft(config); setBuilding(true); }}
          />
        ) : null}
      </main>

      <nav className="dock" aria-label="Разделы">
        <Dock id="map" tab={tab} label="Карта" icon="map" onPick={setTab} />
        <Dock id="missions" tab={tab} label="Миссии" icon="missions" onPick={setTab} />
        <Dock id="resources" tab={tab} label="Ресурсы" icon="resources" onPick={setTab} />
        <Dock id="profile" tab={tab} label="Профиль" icon="profile" onPick={setTab} />
      </nav>

      {nodeId ? (
        <PlaceSheet
          id={nodeId}
          state={states.get(nodeId) ?? "locked"}
          goals={goals}
          level={level}
          xp={xp}
          busy={busy}
          reducedMotion={reducedMotion}
          onClose={() => setNodeId(null)}
          onEnter={enterPlace}
          onDone={finish}
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
        <Sheet title="Proof: загрузи фото" onClose={() => setProof(false)}>
          <ProofForm
            busy={busy}
            onSubmit={async (title, file) => {
              setBusy(true);
              setError(null);
              try {
                const before = player?.progress.xp ?? 0;
                const goal = await createGoal(title, "creativity");
                const url = await uploadImage(file);
                await createArtifact({ title, imageUrl: url, goalId: goal.id });
                const done = await completeGoal(goal.id);
                await refresh();
                setProof(false);
                if (done.progress.xp > before) {
                  setNotice(`+${done.progress.xp - before} XP`);
                  burst();
                }
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Sheet>
      ) : null}

      {building ? (
        <div className="builder-page">
          {error ? <p className="banner bad" role="alert">{error}</p> : null}
          <AvatarBuilder
            value={draft}
            busy={busy}
            onChange={setDraft}
            onDone={async () => {
              setBusy(true);
              setError(null);
              try {
                const saved = await saveAvatar(draft);
                setPlayer(saved);
                setBuilding(false);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
            onPhoto={() => document.getElementById("look-form")?.scrollIntoView({ behavior: "smooth" })}
          />
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
        </div>
      ) : null}
    </div>
  );
}

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

function GoalList({ goals, busy, onDone }: { goals: Goal[]; busy: boolean; onDone: (id: string) => void }) {
  if (goals.length === 0) return <p className="empty">Миссий пока нет.</p>;
  return (
    <ul className="missions">
      {goals.map((goal) => (
        <li key={goal.id}>
          <span>{goal.title}</span>
          {goal.status === "open" ? (
            <button type="button" className="lx-btn lx-btn--secondary lx-btn--sm" disabled={busy} onClick={() => onDone(goal.id)}><span className="lx-btn__in">Готово</span></button>
          ) : <em>закрыта</em>}
        </li>
      ))}
    </ul>
  );
}

function Resources({ player }: { player: Player | null }) {
  const spheres = player?.progress.xpBySphere ?? {};
  const rows = Object.entries(spheres);
  return (
    <section className="panel">
      <h2>Ресурсы</h2>
      {rows.length === 0 ? <p className="empty">Опыт по сферам появится после первой миссии.</p> : null}
      <ul className="bars">
        {rows.map(([id, value]) => (
          <li key={id}>
            <span className="sphere-name">
              {SPHERE_ICON[id] ? <KitIcon name={SPHERE_ICON[id]} size={18} /> : null}
              {LIFE_SPHERES.find((sphere) => sphere.id === id)?.name ?? id}
            </span>
            <i><b style={{ width: `${Math.min(100, value ?? 0)}%` }} /></i>
            <strong>{value}</strong>
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
  onEdit,
}: {
  player: Player | null;
  config: AvatarConfig;
  cheer: boolean;
  placements: Placement[];
  onEdit: () => void;
}) {
  return (
    <section className="panel profile">
      <h2>Профиль</h2>
      <div className="profile-hero">
        <div className="profile-avatar">
          <Avatar config={config} cheer={cheer} title="Мой персонаж" />
        </div>
        <div className="profile-id">
          <strong>{player?.nickname ?? "Игрок"}</strong>
          {player?.title ? <span>{player.title}</span> : null}
          <span>Уровень {player?.progress.level ?? 1}</span>
          <button type="button" className="lx-btn" onClick={onEdit}><span className="lx-btn__in">Собрать персонажа</span></button>
        </div>
      </div>
      <h3>Галерея</h3>
      {placements.length === 0 ? <p className="empty">Фото появятся после proof.</p> : null}
      <ul className="gallery">
        {placements.map((placement) => (
          <li key={placement.artifactId}>
            {placement.artifact.imageUrl ? <img src={placement.artifact.imageUrl} alt={placement.artifact.title} /> : <span>{placement.artifact.title}</span>}
            <em>{placement.artifact.title}</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section className="lx-sheet sheet" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
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

function ProofForm({ busy, onSubmit }: { busy: boolean; onSubmit: (title: string, file: File) => void }) {
  const [title, setTitle] = useState("Тёплый свет");
  const [file, setFile] = useState<File | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    onSubmit(title.trim() || "Фото", file);
  }
  return (
    <form onSubmit={submit}>
      <label htmlFor="proof-title">Подпись</label>
      <input id="proof-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor="proof-file">Фото</label>
      <input id="proof-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
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
      onSubmit={(event) => {
        event.preventDefault();
        if (file && consent) onLook(file, true);
      }}
    >
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>На фото реальный человек, и я соглашаюсь создать по нему персонажа.</span>
      </label>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button type="submit" className="lx-btn lx-btn--wide" disabled={busy || !file || !consent}><span className="lx-btn__in">Создать по фото</span></button>
    </form>
  );
}
