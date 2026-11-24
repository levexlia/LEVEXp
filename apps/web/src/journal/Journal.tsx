import { playerDay, shiftDay } from "@levex/domain";
import { useState } from "react";
import type { Goal } from "../api";
import { SPHERE_ICON, kitIconUrl } from "../map/KitIcon";
import { dayEntries, dayShort, journalWeek, todayEntries, weekdayLabel, type JournalEntry } from "./journal";

const UNDO_ICON = "/art/scene18/ic_undo.svg";
const UNDO_ICON_OFF = "/art/scene18/ic_undo_disabled.svg";

function SphereHex({ sphere, name, size }: { sphere: string | null; name?: string; size?: number }) {
  const icon = sphere ? SPHERE_ICON[sphere] : undefined;
  return (
    <span className="lx-sp" title={name} style={size ? { ["--s" as string]: `${size}px` } : undefined}>
      <img src={icon ? kitIconUrl(icon) : "/art/scene14/badges/mission_open.svg"} alt={name ?? ""} />
    </span>
  );
}

function Entry({ item, past, pending, busy, onUndo, onRedo }: { item: JournalEntry; past?: boolean; pending?: boolean; busy?: boolean; onUndo?: () => void; onRedo?: () => void }) {
  const classes = ["lx-entry"];
  if (item.undone) classes.push("is-undone");
  if (past) classes.push("is-past");
  return (
    <li className={classes.join(" ")} data-entry={item.id} style={{ ["--place" as string]: item.place ? `var(--lx-place-${item.place})` : "var(--lx-cyan)" }}>
      <SphereHex sphere={item.sphere} />
      <div>
        <div className="lx-entry__ttl">{item.title}</div>
        <div className="lx-entry__meta">
          {item.undone ? `${item.sphereName || item.where} · запись отменена` : pending ? `${item.where} · сохраняется…` : item.where}
        </div>
      </div>
      {past ? null : item.undone ? (
        <button type="button" className="lx-undo-hit" disabled={busy} onClick={onRedo} aria-label={`Вернуть запись: ${item.title}`}>
          <span className="lx-undo"><span className="lx-undo__in"><img src={pending ? UNDO_ICON_OFF : UNDO_ICON} alt="" />Вернуть</span></span>
        </button>
      ) : item.undoable ? (
        <button type="button" className="lx-undo-hit" disabled={busy} onClick={onUndo} aria-label={`Отменить запись: ${item.title}`}>
          <span className="lx-undo"><span className="lx-undo__in"><img src={pending ? UNDO_ICON_OFF : UNDO_ICON} alt="" />Отменить</span></span>
        </button>
      ) : null}
    </li>
  );
}

/*
 * «Отменить» / «Вернуть»: the real <button> (.lx-undo-hit) is a transparent ≥44×44 zone; inside it the
 * 28 px scene18 button (.lx-undo) is only drawn. Its clip-path would clip a bigger hit area, hence the wrapper.
 */

/**
 * «Сегодня · ВТ 24»: today's records with «Отменить» (no confirm dialog; «Вернуть» right in the row),
 * then yesterday as it is. «Отменить» takes back the XP of that record; «Вернуть» is a new completion.
 */
export function TodayRecords({
  goals,
  now,
  busy,
  pendingId,
  onUndo,
  onRedo,
}: {
  goals: readonly Goal[];
  now: Date;
  busy: boolean;
  pendingId: string | null;
  onUndo: (goal: Goal) => void;
  onRedo: (goal: Goal) => void;
}) {
  const today = playerDay(now);
  const yesterday = shiftDay(today, -1);
  const entries = todayEntries(goals, now);
  const past = dayEntries(goals, yesterday, now);
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  return (
    <section className="journal-today" aria-labelledby="journal-today-title">
      <h3 id="journal-today-title">Сегодня · {weekdayLabel(today)} {Number(today.slice(8, 10))}</h3>
      <p className="journal-note">Если запись сделана по ошибке, её можно отменить. Это можно сделать до конца дня.</p>
      <p className="journal-label">Записи за сегодня</p>
      {entries.length > 0 ? (
        <ul className="journal-list">
          {entries.map((item) => (
            <Entry
              key={item.id}
              item={item}
              busy={busy}
              pending={pendingId === item.id}
              onUndo={() => onUndo(byId.get(item.id)!)}
              onRedo={() => onRedo(byId.get(item.id)!)}
            />
          ))}
        </ul>
      ) : (
        <p className="empty" data-empty="journal-today">Сегодня записей пока нет.</p>
      )}
      {past.length > 0 ? (
        <>
          <p className="journal-label">Вчера · {weekdayLabel(yesterday)} {Number(yesterday.slice(8, 10))}</p>
          <ul className="journal-list">
            {past.map((item) => <Entry key={item.id} item={item} past />)}
          </ul>
          <p className="journal-note">Прошлые дни остаются в журнале как есть.</p>
        </>
      ) : null}
    </section>
  );
}

/** «Журнал недели» (scene18 mock_week_journal, without bars): days with sphere marks, a per-sphere count, paging. */
export function WeekJournal({ goals, now }: { goals: readonly Goal[]; now: Date }) {
  const [offset, setOffset] = useState(0);
  const week = journalWeek(goals, offset, now);
  return (
    <section className="lx-week" aria-labelledby="week-title">
      <h3 id="week-title">Журнал недели</h3>
      <nav className="lx-week__nav" aria-label="Недели">
        <button type="button" aria-label="Прошлая неделя" disabled={!week.canPrev} onClick={() => setOffset((value) => value - 1)}>‹</button>
        <span data-week={week.start}>{week.label}</span>
        <button type="button" aria-label="Следующая неделя" disabled={!week.canNext} onClick={() => setOffset((value) => Math.min(0, value + 1))}>›</button>
      </nav>
      <ul className="lx-week__days">
        {week.days.map((day) => (
          <li key={day.day} className={`lx-day${day.today ? " is-today" : ""}${day.marks.length === 0 ? " is-empty" : ""}`} data-day={day.day}>
            <div className="lx-day__d">
              <b>{day.today ? "СЕГОДНЯ" : day.weekday}</b>
              <small>{day.today ? `${day.weekday} ${Number(day.day.slice(8, 10))}` : dayShort(day.day)}</small>
            </div>
            {day.marks.length > 0 ? (
              <div className="lx-day__marks">
                {day.marks.map((mark) => (
                  <span key={mark.sphere} className="lx-day__mark" data-sphere={mark.sphere}>
                    <SphereHex sphere={mark.sphere} name={mark.name} />
                    {mark.count > 1 ? <span className="lx-sp__n">×{mark.count}</span> : null}
                  </span>
                ))}
              </div>
            ) : (
              <div className="lx-day__rest"><img src="/art/scene18/day_empty.svg" width={18} height={18} alt="" />Без отметок</div>
            )}
          </li>
        ))}
      </ul>
      <p className="journal-label">Отметки по сферам за неделю</p>
      {week.sum.length > 0 ? (
        <div className="lx-week__sum">
          {week.sum.map((item) => (
            <div key={item.sphere} data-sphere={item.sphere}>
              <SphereHex sphere={item.sphere} />
              {item.name}
              <em>{item.count}</em>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty" data-empty="week">За эту неделю отметок нет.</p>
      )}
    </section>
  );
}
