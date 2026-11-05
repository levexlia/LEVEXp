import { XP_PER_LEVEL } from "@levex/domain";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  ApiError,
  completeGoal,
  createArtifact,
  createGoal,
  loadRoom,
  uploadImage,
  type Goal,
  type Placement,
  type Player,
} from "./api";

export function App() {
  const goalTitleId = useId();
  const photoTitleId = useId();
  const photoUrlId = useId();
  const photoFileId = useId();
  const photoGoalId = useId();

  const [player, setPlayer] = useState<Player | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [goalId, setGoalId] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [photoTitle, setPhotoTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  async function refresh(): Promise<void> {
    const data = await loadRoom();
    setPlayer(data.player);
    setGoals(data.goals);
    setPlacements(data.placements);
    setGoalId((current) => keepGoal(current, data.goals));
  }

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
  const selected = creativity.find((goal) => goal.id === goalId) ?? null;

  async function onCreateGoal(event: FormEvent) {
    event.preventDefault();
    const title = goalTitle.trim();
    if (!title) {
      setError("Введите название цели");
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
      setNotice(`Цель «${created.title}» открыта. Награда сервера: ${created.xpReward} XP, с фото будет 15.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPlacePhoto(event: FormEvent) {
    event.preventDefault();
    const title = photoTitle.trim();
    const pasted = imageUrl.trim();
    if (!selected) {
      setError("Сначала создайте цель творчества");
      setNotice(null);
      return;
    }
    if (!title) {
      setError("Подпишите фото");
      setNotice(null);
      return;
    }
    if (!file && !pasted) {
      setError("Вставьте ссылку или выберите файл");
      setNotice(null);
      return;
    }
    const before = player?.progress.xp ?? 0;
    const wasOpen = selected.status === "open";
    setBusy(true);
    setError(null);
    setNotice(null);
    let placed = false;
    try {
      const url = file ? await uploadImage(file) : pasted;
      await createArtifact({ title, imageUrl: url, goalId: selected.id });
      placed = true;
      let gained = 0;
      if (wasOpen) {
        const done = await completeGoal(selected.id);
        gained = done.progress.xp - before;
      }
      await refresh();
      setPhotoTitle("");
      setImageUrl("");
      setFile(null);
      setFileKey((key) => key + 1);
      const gain = gained > 0 ? ` +${gained} XP.` : " Опыт за эту цель уже начислен.";
      setNotice(`«${title}» на стене.${wasOpen ? gain : ""}`);
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
  const creativityXp = player?.progress.xpBySphere.creativity;

  return (
    <div className="page">
      <header className="mast">
        <div>
          <p className="mark">LEVEX</p>
          <h1>Комната</h1>
        </div>
        <div className="player" aria-live="polite">
          <p className="nick">{player?.nickname ?? (loading ? "…" : "Игрок")}</p>
          {player?.title ? <p className="title">{player.title}</p> : null}
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
            {player
              ? `До уровня ${level + 1}: ${XP_PER_LEVEL - intoLevel} XP`
              : "Ждём API"}
            {creativityXp ? ` · Творчество ${creativityXp}` : ""}
          </p>
        </div>
      </header>

      <main className="layout">
        <section className="desk">
          <p className="lead">
            Цель творчества, фото на стену, закрытие цели. Награду считает сервер: 10 XP, с фото — 15, один раз.
          </p>
          {error ? <p className="banner bad" role="alert">{error}</p> : null}
          {notice ? <p className="banner good" role="status">{notice}</p> : null}

          <form onSubmit={onCreateGoal}>
            <h2>Новая цель</h2>
            <label htmlFor={goalTitleId}>Название</label>
            <input
              id={goalTitleId}
              value={goalTitle}
              maxLength={200}
              placeholder="Нарисовать окно"
              onChange={(event) => setGoalTitle(event.target.value)}
            />
            <button type="submit" disabled={busy || loading}>Создать цель</button>
          </form>

          <form onSubmit={onPlacePhoto}>
            <h2>Фото</h2>
            <label htmlFor={photoGoalId}>Цель</label>
            <select
              id={photoGoalId}
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
              disabled={creativity.length === 0}
            >
              {creativity.length === 0 ? <option value="">Нет целей творчества</option> : null}
              {[...creativity].reverse().map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title} · {goal.status === "open" ? "открыта" : "закрыта"} · {goal.xpReward} XP
                </option>
              ))}
            </select>

            <label htmlFor={photoTitleId}>Подпись</label>
            <input
              id={photoTitleId}
              value={photoTitle}
              maxLength={200}
              placeholder="Утренний свет"
              onChange={(event) => setPhotoTitle(event.target.value)}
            />

            <label htmlFor={photoUrlId}>Ссылка на картинку</label>
            <input
              id={photoUrlId}
              value={imageUrl}
              maxLength={2048}
              placeholder="https://… или /uploads/…"
              autoComplete="off"
              onChange={(event) => setImageUrl(event.target.value)}
            />

            <label htmlFor={photoFileId}>Или файл</label>
            <input
              key={fileKey}
              id={photoFileId}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="hint">
              {file
                ? `Файл «${file.name}» уйдёт на сервер, ссылка выше не используется.`
                : "PNG, JPEG, GIF или WebP, до 5 МБ. Файл важнее ссылки, если выбраны оба."}
            </p>
            <button type="submit" disabled={busy || loading || !selected}>
              {selected?.status === "done" ? "Повесить в комнату" : "Повесить и закрыть цель"}
            </button>
          </form>
        </section>

        <section className="wall" aria-labelledby="wall-heading">
          <div className="wall-head">
            <h2 id="wall-heading">Стена</h2>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                refresh()
                  .catch((err: unknown) => setError(messageOf(err)))
                  .finally(() => setBusy(false));
              }}
            >
              Обновить
            </button>
          </div>
          {placements.length === 0 ? (
            <p className="empty">Пока пусто. Создайте цель и повесьте фото — оно останется после обновления страницы.</p>
          ) : (
            <ul className="frames">
              {placements.map((placement) => {
                const artifact = placement.artifact;
                const goal = goals.find((item) => item.id === artifact.goalId);
                const showImage = artifact.imageUrl && !broken[artifact.id];
                return (
                  <li key={placement.artifactId} className="frame">
                    {showImage ? (
                      <img
                        src={artifact.imageUrl}
                        alt={artifact.title}
                        onError={() => setBroken((current) => ({ ...current, [artifact.id]: true }))}
                      />
                    ) : (
                      <div className="missing">{artifact.imageUrl ? "Картинка не открылась" : "Без картинки"}</div>
                    )}
                    <p className="caption">{artifact.title}</p>
                    {goal ? (
                      <p className="meta">{goal.title} · {goal.status === "done" ? "цель закрыта" : "цель открыта"}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="persist">
            Та же стена после обновления страницы и после перезапуска API с тем же DATA_FILE.
            Загруженный файл лежит в uploads рядом с этим файлом.
          </p>
        </section>
      </main>
    </div>
  );
}

function keepGoal(current: string, goals: Goal[]): string {
  const creativity = goals.filter((goal) => goal.sphere === "creativity");
  if (creativity.some((goal) => goal.id === current)) return current;
  const open = [...creativity].reverse().find((goal) => goal.status === "open");
  return (open ?? creativity.at(-1))?.id ?? "";
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Что-то пошло не так";
}
