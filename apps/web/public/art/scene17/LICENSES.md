# LEVEX · scene17 — лицензии

## Графика (собственная работа)
Поза робота «подсказка» (robot_hint, robot_hint_left), облачко подсказки (рамка, хвост, CSS), три иллюстрации пустых
состояний (пустой день, нет своих миссий, пустые «Ресурсы»), моки, доска и GIF нарисованы с нуля кодом (inline SVG + CSS)
в `work/art17.py` и `work/build17.py`. Основа — собственный робот scene15 (`scene15/work/robot15.py`) и собственные карта,
шапка, табы и кнопки scene14 (`scene14/work/x14.py`). Сторонних изображений, стоков и ИИ-генераций нет; единственная чужая иконка — Lucide trash-2 (см. ниже).
Права — у проекта LEVEX.

## Иконка удаления — Lucide trash-2 (ISC)
- `svg/ic_trash.svg` и иконка в строках своих миссий на моке `own_missions_390x844.png` — геометрия Lucide `trash-2`
  из lucide-static 1.78.0 (https://unpkg.com/lucide-static@1.78.0/icons/trash-2.svg), без изменений формы, перекрашена в #8a96d6.
- Лицензия Lucide — ISC, Copyright (c) 2026 Lucide Icons and Contributors. По файлу LICENSE Lucide иконка `trash-2`
  происходит из Feather — MIT, Copyright (c) 2013-present Cole Bemis. Полный текст обеих лицензий: `licenses/LICENSE_lucide.txt`
  (скачан из github.com/lucide-icons/lucide, ветка main). При встраивании положить этот текст рядом и сохранить комментарий в SVG.

## Шрифты — SIL Open Font License 1.1
- Tektur — Copyright 2023 The Tektur Project Authors. Текст лицензии: `fonts/OFL_Tektur.txt` (из google/fonts).
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors. Текст лицензии: `fonts/OFL_JetBrainsMono.txt` (из google/fonts).
Как используются: только в PNG и GIF (текст растеризован). В SVG из `svg/` текста и шрифтов нет.
`levex-hint.css` ссылается на семейства Tektur и JetBrains Mono, которые уже подключает `levex-x.css` (scene14, OFL).

## Инструменты сборки (в результат не входят)
puppeteer-core (Apache-2.0) и Google Chrome headless — только рендер; ffmpeg (LGPL/GPL) — кодирование GIF;
Python 3 (PSF).

Ничего не коммитилось и не пушилось в репозиторий, PR не создавался.
