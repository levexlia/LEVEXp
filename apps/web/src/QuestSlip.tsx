import type { FormEvent } from "react";
import type { Goal } from "./api";

export type QuestMode = "loading" | "name" | "photo" | "rest";

export function QuestSlip({
  mode,
  busy,
  error,
  notice,
  placementsCount,
  goalTitle,
  onGoalTitle,
  openGoals,
  goalId,
  onGoalId,
  photoTitle,
  onPhotoTitle,
  imageUrl,
  onImageUrl,
  fileKey,
  fileName,
  onFile,
  onCreate,
  onPlace,
  onAnother,
  onRefresh,
}: {
  mode: QuestMode;
  busy: boolean;
  error: string | null;
  notice: string | null;
  placementsCount: number;
  goalTitle: string;
  onGoalTitle: (value: string) => void;
  openGoals: Goal[];
  goalId: string;
  onGoalId: (value: string) => void;
  photoTitle: string;
  onPhotoTitle: (value: string) => void;
  imageUrl: string;
  onImageUrl: (value: string) => void;
  fileKey: number;
  fileName: string | null;
  onFile: (file: File | null) => void;
  onCreate: (event: FormEvent) => void;
  onPlace: (event: FormEvent) => void;
  onAnother: () => void;
  onRefresh: () => void;
}) {
  const selected = openGoals.find((goal) => goal.id === goalId) ?? openGoals[0];

  return (
    <section className="slip" aria-labelledby="quest-title">
      {mode !== "loading" ? <Steps mode={mode} /> : null}
      {error ? <p className="banner bad" role="alert">{error}</p> : null}
      {notice ? <p className="banner good" role="status">{notice}</p> : null}

      {mode === "loading" ? <h2 id="quest-title">Комната открывается…</h2> : null}

      {mode === "name" ? (
        <form onSubmit={onCreate}>
          <h2 id="quest-title">{placementsCount === 0 ? "Первая работа" : "Ещё одна работа"}</h2>
          <p>Назови, что сделаешь. Это короткий квест творчества.</p>
          <label htmlFor="quest-name">Название</label>
          <input
            id="quest-name"
            value={goalTitle}
            maxLength={200}
            placeholder="Нарисовать окно"
            onChange={(event) => onGoalTitle(event.target.value)}
          />
          <button type="submit" disabled={busy}>Взять квест</button>
        </form>
      ) : null}

      {mode === "photo" && selected ? (
        <form onSubmit={onPlace}>
          <h2 id="quest-title">{selected.title}</h2>
          <p>Принеси фотографию и повесь её на стену. Сервер начислит 15 XP один раз.</p>
          {openGoals.length > 1 ? (
            <>
              <label htmlFor="quest-goal">Какой квест</label>
              <select id="quest-goal" value={selected.id} onChange={(event) => onGoalId(event.target.value)}>
                {openGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="quest-caption">Подпись</label>
          <input
            id="quest-caption"
            value={photoTitle}
            maxLength={200}
            placeholder="Утренний свет"
            onChange={(event) => onPhotoTitle(event.target.value)}
          />
          <label htmlFor="quest-url">Ссылка</label>
          <input
            id="quest-url"
            value={imageUrl}
            maxLength={2048}
            placeholder="https://… или /uploads/…"
            autoComplete="off"
            onChange={(event) => onImageUrl(event.target.value)}
          />
          <label htmlFor="quest-file">Или файл</label>
          <input
            key={fileKey}
            id="quest-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
          <p className="hint">
            {fileName
              ? `Файл «${fileName}» уйдёт на сервер. Ссылка выше не используется.`
              : "PNG, JPEG, GIF или WebP, до 5 МБ. Если выбраны и файл, и ссылка, уходит файл."}
          </p>
          <button type="submit" disabled={busy}>Повесить и закрыть квест</button>
        </form>
      ) : null}

      {mode === "rest" ? (
        <div>
          <h2 id="quest-title">Работа на стене</h2>
          <p>
            {placementsCount === 0
              ? "Открытых квестов нет, стена ещё пустая."
              : `На стене ${worksLabel(placementsCount)}. После обновления страницы они на том же месте.`}
          </p>
          <button type="button" disabled={busy} onClick={onAnother}>Ещё одна работа</button>
        </div>
      ) : null}

      <button type="button" className="quiet" disabled={busy || mode === "loading"} onClick={onRefresh}>
        Обновить комнату
      </button>
    </section>
  );
}

function Steps({ mode }: { mode: Exclude<QuestMode, "loading"> }) {
  const current = mode === "name" ? 0 : mode === "photo" ? 1 : 3;
  const labels = ["Назвать", "Принести фото", "Повесить"];
  return (
    <ol className="steps" aria-label="Шаги квеста">
      {labels.map((label, index) => {
        const state = index < current ? "done" : index === current ? "now" : "later";
        return (
          <li key={label} className={state} aria-current={state === "now" ? "step" : undefined}>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function worksLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} работа`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} работы`;
  return `${count} работ`;
}
