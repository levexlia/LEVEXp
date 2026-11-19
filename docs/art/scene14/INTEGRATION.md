# Подключение art/scene14 (X «Неон-кибер») — заметки для разработчика

## Что уже в ветке `art/scene14-neon-cyber`
- `apps/web/public/art/scene14/**` — ассеты (см. README там же), шрифты + OFL, LICENSES.md.
- `apps/web/src/theme/levex-x.css` — CSS-переменные, `@font-face`, классы `.lx-btn` / `.lx-chip` / `.lx-sheet`.
- `apps/web/src/theme/levex-x.tokens.json` — те же токены в JSON + карта путей к ассетам.
- `apps/web/src/theme/levex-x.test.ts` — vitest: все файлы на месте, SVG самодостаточны, контраст кнопок, CSS = JSON.
- `docs/art/scene14/` — превью (главный экран, 4 карточки мест, состояния UI, аватары, проверка 22 px).

## Почему код не подключён
В `main` нет веб-клиента: там только `apps/api` и `packages/domain`. Клиент с картой scene11, иконками icons2 и
аватаром из набора деталей живёт в открытом PR #10 (`cursor/levex-vector-ui`). Подключать без него некуда,
а переносить клиент из PR #10 сюда — большое изменение, не по задаче арта.

## Готовый патч для PR #10 — проверен локально
`docs/art/scene14/pr10-wiring.patch` (git diff поверх `cursor/levex-vector-ui` @ f7ce557, только `apps/web/src`):
- `spots.ts`: `MAP_SVG` → `/art/scene14/map/map_bg_720x1280.svg` (фон и сетка без куполов), `BADGE_FILE` → `/art/scene14/badges/*.svg`;
- `HomeMap.tsx`: `DomeState` рисует `domes/{id}_{state}.svg` по боксам из `map/scene14_domes.json` (копия
  `public/art/scene14/domes/domes.json`) вместо серого фильтра и пятен свечения; `BADGE_BOX = 48`, `BADGE_CENTER = [24, 24]`, коэффициент 0.833;
- `placeIcons.ts`: `PLACE_ICON_DIR = "/art/scene14/places"`;
- `spots.test.ts`: проверка лицензии смотрит `art/scene14/LICENSES.md` вместо Lucide.
Применение: `git checkout cursor/levex-vector-ui && git merge origin/art/scene14-neon-cyber && git apply docs/art/scene14/pr10-wiring.patch`.
Результат на той ветке: `vitest` 83/83, `tsc` web ok, `vite build` ok. Скриншот 390×844: `docs/art/scene14/app_preview_pr10_390x844.webp`
(новый игрок, уровень 1: Дом текущий, Учебный центр доступен, остальное закрыто). Аватар там прежний — из набора деталей PR #10.

## Что сделать после мержа PR #10 (или ребейза на него) — подробно
1. **Тема.** В `apps/web/src/main.tsx`: `import "./theme/levex-x.css";`. В `styles.css` заменить цвета/шрифты
   на `var(--lx-*)` (фон `--lx-bg`, контур `--lx-outline`, неон `--lx-violet` / `--lx-cyan`, шрифт `--lx-font-display`).
2. **Иконки мест.** `apps/web/src/map/placeIcons.ts`: `PLACE_ICON_DIR = "/art/scene14/places"` — имена файлов
   уже совпадают (`home/study/park/workshop/center.svg`). Для закрытого места брать `{id}_locked.svg`.
   Lucide-копии icons2 и `LICENSE-lucide-ISC.txt` после этого можно удалить.
3. **Жетоны.** `HomeMap.tsx`: `/map/badge_{state}_full.svg` → `/art/scene14/badges/{state}.svg`
   (`done | current | available | locked`). Внимание: жетоны scene14 нарисованы в viewBox 48, у kit-жетонов — 919;
   поправить константу визуального центра (`BADGE_RADIUS` / смещение).
4. **Карта.** `apps/web/src/map/spots.ts`: `MAP_SVG = "/art/scene14/map/map_720x1280.svg"` — это готовая замена
   `scene11_map.svg`: тот же viewBox 720×1280 и те же координаты куполов и жетонов, что в `map_spots.json`
   (раскладка scene14 взята из scene11). `map/map.svg` — тот же кадр в css-пикселях 390×844.
   Если купол должен менять вид по состоянию игрока (current = кольца, locked = серый), собирать карту из
   `domes/{id}_{state}.svg`.
5. **Аватар на карте.** Рядом с текущим местом: `<img src="/art/scene14/avatar/operator.svg" width=48 height=96 class="lx-avatar">`.
   Аватар из набора деталей (AvatarBuilder) — отдельное решение Лии; operator — стилизованный силуэт без лица.
6. **Кнопки.** Proof / «Войти» / «Начать» / «Повторить»: `<button class="lx-btn"><span class="lx-btn__in">…</span></button>`;
   «Позже» — `lx-btn lx-btn--secondary`; неактивная — атрибут `disabled`. Готовые SVG в `ui/btn_*.svg` — для превью/иконок.
7. **Карточка места (шторка).** Вёрстка по `docs/art/scene14/mock_sheet_*_390x844.png`, оболочка `.lx-sheet > .lx-sheet__in`.
   Состояния: доступно → «Начать», текущее → «Позже» + «Войти», пройдено → только «Повторить» на всю ширину,
   закрыто → условие открытия + «Войти» с `disabled`. Названия миссий, награды и условия на макетах — пример.
   Подсказка закрытого места из PR #10 («…откроется на уровне 4») ложится в блок «Условие открытия».
8. **Анимация.** Цикл 2.4 с внутри SVG. Под `prefers-reduced-motion` стоит показывать статичный кадр
   (например, отдавать `<img>` с `?static` и CSS `animation:none` — у SVG в `<img>` анимацию снаружи не выключить,
   проще держать статичные копии; могу сделать по запросу).
