import { useEffect, useState, type FormEvent } from "react";
import {
  errorMessage,
  generateAvatar,
  loadAvatar,
  selectAvatar,
  type AvatarCandidate,
  type Player,
} from "./api";

const MAX_BYTES = 5 * 1024 * 1024;

export function CharacterScreen({
  onClose,
  onPlayer,
}: {
  onClose: () => void;
  onPlayer: (player: Player) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [keep, setKeep] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AvatarCandidate[]>([]);
  const [quota, setQuota] = useState<{ limit: number; remaining: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAvatar()
      .then((status) => {
        if (cancelled) return;
        setQuota({ limit: status.limit, remaining: status.remaining });
        if (status.candidates.length > 0) setCandidates(status.candidates);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setError("Отметьте согласие: на фото должен быть реальный человек");
      return;
    }
    if (!file) {
      setError("Выберите фото");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Файл больше 5 МБ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await generateAvatar(file, true, keep);
      setCandidates(result.candidates);
      setQuota({ limit: result.limit, remaining: result.remaining });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function choose(id: string) {
    setPicking(id);
    setError(null);
    try {
      onPlayer(await selectAvatar(id));
    } catch (err) {
      setError(errorMessage(err));
      setPicking(null);
    }
  }

  const limitReached = quota !== null && quota.remaining === 0;

  return (
    <section className="slip character-slip" aria-labelledby="avatar-title">
      <p className="kicker">Персонаж</p>
      <h2 id="avatar-title">Создать персонажа</h2>
      <p>
        Загрузите селфи. Сервер нарисует вас в полный рост в стиле комнаты: тёплая гуашь, янтарь, персик и шалфей.
        Исходное фото удаляется сразу после генерации, если вы не попросите его оставить.
      </p>
      {quota ? <p className="hint">Сегодня можно ещё {quota.remaining} из {quota.limit}.</p> : null}
      {limitReached ? <p className="banner bad" role="status">Лимит генераций на сегодня исчерпан.</p> : null}
      {error ? <p className="banner bad" role="alert">{error}</p> : null}

      <form onSubmit={onSubmit}>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>На фото реальный человек, и я соглашаюсь использовать его, чтобы создать игрового персонажа.</span>
        </label>
        <label htmlFor="avatar-file">Фото</label>
        <div className="file-row">
          <input
            id="avatar-file"
            className="file-native"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <label htmlFor="avatar-file" className="file-pick">Выбрать фото</label>
          {file ? <span className="file-name">{file.name}</span> : <span className="file-name">PNG, JPEG или WebP, до 5 МБ</span>}
        </div>
        {preview ? <img className="selfie-preview" src={preview} alt="Выбранное фото" /> : null}
        <label className="check">
          <input
            type="checkbox"
            checked={keep}
            disabled={busy}
            onChange={(event) => setKeep(event.target.checked)}
          />
          <span>Оставить исходное фото на сервере</span>
        </label>
        <button type="submit" disabled={busy || limitReached}>
          {busy ? "Рисуем персонажа…" : "Нарисовать"}
        </button>
      </form>

      {busy ? <p className="banner good" role="status">Рисуем персонажа…</p> : null}

      {candidates.length > 0 ? (
        <div>
          <h3>Выберите персонажа</h3>
          <ul className="candidates">
            {candidates.map((candidate, index) => (
              <li key={candidate.id}>
                <img src={candidate.url} alt={`Вариант ${index + 1}`} />
                <button type="button" disabled={picking !== null} onClick={() => choose(candidate.id)}>
                  {picking === candidate.id ? "Сохраняем…" : "Выбрать"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button type="button" className="quiet" onClick={onClose} disabled={picking !== null}>В комнату</button>
    </section>
  );
}
