import { DEFAULT_AVATAR_CONFIG, LIFE_SPHERES, XP_PER_LEVEL, type AvatarConfig, type MapNodeId } from "@levex/domain";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
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
import { AvatarBuilder } from "./AvatarBuilder";
import { HomeMap, mapStates } from "./HomeMap";
import { PlaceSheet } from "./PlaceSheet";
import { segments } from "./map/placeSheet";
import { useReducedMotion } from "./theme/useReducedMotion";
import { avatarFeet, spotFor, toViewPercent } from "./map/spots";
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
  const currentId = [...states].find(([, state]) => state === "current")?.[0] ?? "home";
  const avatarSpot = toViewPercent(avatarFeet(spotFor(currentId)));

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
          <span className="cnt streak" title="Серия"><UiIcon name="flame" tone="var(--lx-place-home)" />{pad2(player?.streak ?? 0)}<small>Серия</small></span>
          <span className="cnt energy" title="Энергия"><UiIcon name="bolt" tone="var(--lx-gold)" />{energy.current}/{energy.max}</span>
          <span className="lvl">Уровень<span className="lvl-hex"><b>{pad2(level)}</b></span></span>
        </div>
        <button type="button" className="mini" onClick={() => { setDraft(config); setBuilding(true); }} aria-label="Персонаж">
          <Operator cheer={cheer && !reducedMotion} />
        </button>
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
            <aside className="stage-avatar">
              <Operator cheer={cheer && !reducedMotion} size={2.4} />
            </aside>
            <div className="map-column">
              <div className="map-frame">
                <HomeMap states={states} reducedMotion={reducedMotion} onOpen={setNodeId} />
                <div className="map-avatar" style={avatarSpot} aria-hidden="true">
                  <Operator cheer={cheer && !reducedMotion} />
                </div>
              </div>
              <div className="proof-row">
                <button type="button" className="lx-btn proof" onClick={() => setProof(true)}>
                  <span className="lx-btn__in"><UiIcon name="camera" />Proof</span>
                </button>
              </div>
            </div>
            <aside className="stage-side" aria-labelledby="today-title">
              <h2 id="today-title">Сегодня</h2>
              <p className="streak-line"><UiIcon name="flame" tone="var(--lx-place-home)" /> Серия: {player?.streak ?? 0} {dayWord(player?.streak ?? 0)}</p>
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

function Dock({ id, tab, label, icon, onPick }: { id: Tab; tab: Tab; label: string; icon: UiIconName; onPick: (id: Tab) => void }) {
  return (
    <button type="button" className={tab === id ? "dock-btn on" : "dock-btn"} aria-current={tab === id ? "page" : undefined} onClick={() => onPick(id)}>
      <UiIcon name={icon} size={26} tone={tab === id ? undefined : "#56618c"} />
      <span>{label}</span>
    </button>
  );
}

type UiIconName = "map" | "missions" | "resources" | "profile" | "camera" | "flame" | "bolt";

/**
 * A scene14 UI icon. The kit draws them in cyan; `tone` recolours one through a CSS mask
 * (same shape, no new art), as the mocks do for the flame, the bolt and inactive tabs.
 */
function UiIcon({ name, size = 20, tone }: { name: UiIconName; size?: number; tone?: string }) {
  const src = `/art/scene14/ui/ic_${name}.svg`;
  if (!tone) return <img className="ui-icon" src={src} width={size} height={size} alt="" />;
  return (
    <span
      className="ui-icon masked"
      aria-hidden="true"
      style={{ width: size, height: size, background: tone, WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }}
    />
  );
}

const OPERATOR = "/art/scene14/avatar/operator.svg";

/** The scene14 'operator' avatar (48×96). Replaces the parts-kit figure on the map, header and desktop stage. */
function Operator({ cheer = false, size = 1 }: { cheer?: boolean; size?: number }) {
  return <img className={cheer ? "lx-avatar operator cheer" : "lx-avatar operator"} src={OPERATOR} width={48 * size} height={96 * size} alt="" />;
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

function Profile({ placements, onEdit }: { placements: Placement[]; onEdit: () => void }) {
  return (
    <section className="panel">
      <h2>Профиль</h2>
      <button type="button" className="lx-btn lx-btn--wide" onClick={onEdit}><span className="lx-btn__in">Собрать персонажа</span></button>
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
