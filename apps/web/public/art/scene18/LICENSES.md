# LEVEX · scene18 — лицензии

## Графика
- Собственная работа (права у проекта LEVEX): `ic_anywhere_b.svg` (иконка «орбита»), `day_empty.svg`, `sphere_frame.svg`,
  шестиугольная рамка в `ic_anywhere_a.svg`, весь CSS `levex-scene18.css`, моки и доски. Нарисовано кодом в `work/art18.py`, `work/css18.py`, `work/build18.py`.
- **Lucide** (`lucide-static` v1.78.0, npm) — **ISC License**, © Lucide Icons and Contributors. Проверено по файлу LICENSE пакета;
  полный текст: `licenses/LICENSE_lucide-static.txt`. Использованы контуры иконок:
  - `undo-2` → `ic_undo.svg`, `ic_undo_hover.svg`, `ic_undo_disabled.svg` (перекрашено в 2 тона LEVEX, добавлен контур #0a1c46);
  - `globe` → `ic_anywhere_a.svg`, `ic_anywhere_a_glyph.svg` (перекрашено, вписано в шестиугольник).
  Обе иконки не входят в список Feather-иконок (MIT) из того же LICENSE — для них действует ISC. В каждом SVG есть комментарий с указанием источника.
- Иконки сфер `sp_*.svg` и иконки мест на моках — существующие ассеты клиента (`apps/web/public/map`, `public/art/scene14/places`), только читаются, не копируются в `svg/`.

## Шрифты — SIL Open Font License 1.1
- Tektur — © 2023 The Tektur Project Authors (`fonts/OFL_Tektur.txt`).
- JetBrains Mono — © 2020 The JetBrains Mono Project Authors (`fonts/OFL_JetBrainsMono.txt`).
Используются только в PNG (растеризовано). В SVG из `svg/` текста и шрифтов нет; CSS ссылается на семейства, которые уже подключает `levex-x.css`.

## Инструменты сборки (в результат не входят)
puppeteer-core (Apache-2.0), Google Chrome headless, Python 3 (PSF).

Ничего не коммитилось и не пушилось в репозиторий.
