# LEVEX · scene15 — лицензии

## Графика (собственная работа)
Робот-помощник (5 состояний), маркер, кнопки и индикатор чата, CSS шторки, моки, доски, GIF и MP4 нарисованы
с нуля кодом (inline SVG + CSS) в `work/robot15.py`, `work/chat15.py` и `work/build15.py`. Основа — собственный
operator scene14 и собственные карта, шапка и табы scene14 (`scene14/work/x14.py`). Сторонних изображений,
иконок-паков, стоков и ИИ-генераций нет. Права — у проекта LEVEX.

## Шрифты — SIL Open Font License 1.1
- Tektur — Copyright 2023 The Tektur Project Authors. Текст лицензии: `fonts/OFL_Tektur.txt` (из google/fonts).
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors. Текст лицензии: `fonts/OFL_JetBrainsMono.txt` (из google/fonts).
Как используются: только в PNG, GIF и MP4 (текст растеризован). В SVG из `svg/` текста и шрифтов нет.
`levex-chat.css` ссылается на семейства Tektur и JetBrains Mono, которые уже подключает `levex-x.css` (scene14, OFL).

## Инструменты сборки (в результат не входят)
puppeteer-core (Apache-2.0) и Google Chrome headless — только рендер; ffmpeg (LGPL/GPL) — кодирование GIF и MP4;
Pillow (MIT-CMU/HPND), fontTools (MIT), Python 3 (PSF).

Ничего не коммитилось и не пушилось в репозиторий.
