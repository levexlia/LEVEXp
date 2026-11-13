import { isDisplayableImageUrl, LIFE_SPHERES, XP_PER_LEVEL } from "@levex/domain";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  completeGoal,
  createArtifact,
  createGoal,
  errorMessage,
  loadRoom,
  uploadImage,
  type Goal,
  type Placement,
  type Player,
} from "./api";
import { CharacterScreen } from "./CharacterScreen";
import { QuestSlip, type QuestMode } from "./QuestSlip";
import { RoomScene } from "./RoomScene";

export function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [goalId, setGoalId] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [photoTitle, setPhotoTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [wantNew, setWantNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [cheer, setCheer] = useState(0);
  const [floatXp, setFloatXp] = useState<{ amount: number; id: number } | null>(null);
  const [screen, setScreen] = useState<"room" | "avatar">(readScreen);

  async function refresh(): Promise<void> {
    const data = await loadRoom();
    setPlayer(data.player);
    setGoals(data.goals);
    setPlacements(data.placements);
    setGoalId((current) => keepGoal(current, data.goals));
  }

  useEffect(() => {
    const onHash = () => setScreen(readScreen());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRoom()
      .then((data) => {
        if (cancelled) return;
        setPlayer(data.player);
        setGoals(data.goals);
        setPlacements(data.placements);
        setGoalId(keepGoal("", data.goals));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(messageOf(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const creativity = goals.filter((goal) => goal.sphere === "creativity");
  const openGoals = creativity.filter((goal) => goal.status === "open");
  const mode: QuestMode = loading && !player
    ? "loading"
    : openGoals.length > 0
      ? "photo"
      : wantNew || creativity.length === 0
        ? "name"
        : "rest";

  async function onCreateGoal(event: FormEvent) {
    event.preventDefault();
    const title = goalTitle.trim();
    if (!title) {
      setError("Введите название работы");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createGoal(title);
      await refresh();
      setGoalId(created.id);
      setGoalTitle("");
      setWantNew(false);
      setNotice(`Квест «${created.title}» открыт. Осталось принести фото.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPlacePhoto(event: FormEvent) {
    event.preventDefault();
    const selected = openGoals.find((goal) => goal.id === goalId) ?? openGoals[0];
    const title = photoTitle.trim();
    const pasted = imageUrl.trim();
    if (!selected) {
      setError("Сначала назови работу");
      setNotice(null);
      return;
    }
    if (!title) {
      setError("Подпишите фото");
      setNotice(null);
      return;
    }
    if (!file && !pasted) {
      setError("Выберите файл или вставьте ссылку");
      setNotice(null);
      return;
    }
    if (!file && !isDisplayableImageUrl(pasted)) {
      setError("Нужна ссылка http(s) или адрес /uploads/…");
      setNotice(null);
      return;
    }
    const before = player?.progress.xp ?? 0;
    setBusy(true);
    setError(null);
    setNotice(null);
    let placed = false;
    try {
      const url = file ? await uploadImage(file) : pasted;
      await createArtifact({ title, imageUrl: url, goalId: selected.id });
      placed = true;
      const done = await completeGoal(selected.id);
      const gained = done.progress.xp - before;
      await refresh();
      setPhotoTitle("");
      setImageUrl("");
      setFile(null);
      setFileKey((key) => key + 1);
      setWantNew(false);
      if (gained > 0) {
        const id = cheer + 1;
        setCheer(id);
        setFloatXp({ amount: gained, id });
        window.setTimeout(() => {
          setFloatXp((current) => (current?.id === id ? null : current));
        }, 1700);
      }
      setNotice(gained > 0
        ? `«${title}» на стене. +${gained} XP.`
        : `«${title}» на стене. Опыт за эту цель уже начислен.`);
    } catch (err) {
      if (placed) await refresh().catch(() => undefined);
      setError(placed ? `${messageOf(err)} Фото уже в комнате.` : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const xp = player?.progress.xp ?? 0;
  const level = player?.progress.level ?? 1;
  const intoLevel = xp % XP_PER_LEVEL;
  const spheres = LIFE_SPHERES.filter((sphere) => sphere.id === "creativity" || (player?.progress.xpBySphere[sphere.id] ?? 0) > 0);

  return (
    <div className="page">
      <header className="hud">
        <div className="hud-who">
          <div className="who-row">
            {avatarSrc(player?.avatarUrl) ? (
              <img className="hud-face" src={avatarSrc(player?.avatarUrl) ?? ""} alt="" />
            ) : null}
            <div>
              <p className="mark">LEVEX</p>
              <h1>{player?.nickname ?? (loading ? "…" : "Игрок")}</h1>
              {player?.title ? <p className="epithet">{player.title}</p> : null}
              <button
                type="button"
                className="hud-create"
                onClick={() => {
                  if (screen === "avatar") closeAvatar(setScreen);
                  else window.location.hash = "avatar";
                }}
              >
                {screen === "avatar" ? "В комнату" : player?.avatarUrl ? "Сменить персонажа" : "Создать персонажа"}
              </button>
            </div>
          </div>
        </div>
        <div className={`hud-xp${cheer ? " hot" : ""}`}>
          <div className="badge" aria-hidden="true">{player ? level : "–"}</div>
          <div className="meters">
            <p className="level">
              Уровень {player ? level : "—"}
              <span>{player ? `${xp} XP` : ""}</span>
            </p>
            <div
              className="bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={XP_PER_LEVEL}
              aria-valuenow={player ? intoLevel : 0}
              aria-label="Опыт внутри текущего уровня"
            >
              <span style={{ width: `${player ? intoLevel : 0}%` }} />
            </div>
            <p className="next">
              {player ? `До уровня ${level + 1}: ${XP_PER_LEVEL - intoLevel} XP` : "Ждём API"}
            </p>
          </div>
        </div>
        <ul className="spheres" aria-label="Опыт по сферам">
          {spheres.map((sphere) => (
            <li key={sphere.id}>
              <span>{sphere.name}</span>
              <strong>{player?.progress.xpBySphere[sphere.id] ?? 0}</strong>
            </li>
          ))}
        </ul>
      </header>

      <main>
        {screen === "avatar" ? (
          <CharacterScreen
            onClose={() => closeAvatar(setScreen)}
            onPlayer={(next) => {
              setPlayer(next);
              closeAvatar(setScreen);
            }}
          />
        ) : (
        <>
        <div className="stage">
          {floatXp ? (
            <div className="xp-pop" key={floatXp.id} aria-hidden="true">
              <p className="xp-float">+{floatXp.amount} XP</p>
              {Array.from({ length: 10 }, (_, index) => (
                <i key={index} className="spark" style={{ "--i": index } as CSSProperties} />
              ))}
            </div>
          ) : null}
          <RoomScene
            placements={placements}
            broken={broken}
            cheer={cheer}
            avatarUrl={player?.avatarUrl ?? null}
            onImageError={(id) => setBroken((current) => ({ ...current, [id]: true }))}
            onCreateCharacter={() => {
              window.location.hash = "avatar";
            }}
          />
        </div>
        <QuestSlip
          mode={mode}
          busy={busy || loading}
          error={error}
          notice={notice}
          placementsCount={placements.length}
          goalTitle={goalTitle}
          onGoalTitle={setGoalTitle}
          openGoals={openGoals}
          goalId={goalId}
          onGoalId={setGoalId}
          photoTitle={photoTitle}
          onPhotoTitle={setPhotoTitle}
          imageUrl={imageUrl}
          onImageUrl={setImageUrl}
          fileKey={fileKey}
          fileName={file?.name ?? null}
          onFile={setFile}
          onCreate={onCreateGoal}
          onPlace={onPlacePhoto}
          onAnother={() => {
            setWantNew(true);
            setNotice(null);
            setError(null);
          }}
          onRefresh={() => {
            setBusy(true);
            setError(null);
            refresh()
              .catch((err: unknown) => setError(messageOf(err)))
              .finally(() => setBusy(false));
          }}
        />
        </>
        )}
      </main>
    </div>
  );
}

function readScreen(): "room" | "avatar" {
  return window.location.hash === "#avatar" ? "avatar" : "room";
}

function closeAvatar(setScreen: (screen: "room" | "avatar") => void): void {
  const next = window.location.pathname + window.location.search;
  window.history.pushState(null, "", next);
  setScreen("room");
}

function avatarSrc(value: string | undefined): string | null {
  if (!value || !isDisplayableImageUrl(value)) return null;
  return value.trim();
}

function keepGoal(current: string, goals: Goal[]): string {
  const open = goals.filter((goal) => goal.sphere === "creativity" && goal.status === "open");
  if (open.some((goal) => goal.id === current)) return current;
  return open.at(-1)?.id ?? "";
}

function messageOf(err: unknown): string {
  return errorMessage(err);
}
