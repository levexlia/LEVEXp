# LEVEX · art/scene14 (направление X «Неон-кибер») — лицензии

## Графика — собственная работа
Все SVG в этой папке (карта, купола на гекс-островах, иконки мест и их _locked-версии, жетоны состояний,
кнопки, чипы, UI-иконки, аватары operator / hex_portrait / hologram) и превью в `docs/art/scene14/`
нарисованы с нуля кодом (SVG + CSS) художником LEVEX. Сторонних изображений, иконок-паков, стоков и
ИИ-генераций нет. Права — у проекта LEVEX.

## Шрифты — SIL Open Font License 1.1
| Файл | Шрифт | Копирайт | Лицензия |
|---|---|---|---|
| `fonts/Tektur-Variable.ttf` | Tektur | Copyright 2023 The Tektur Project Authors (https://www.github.com/hyvyys/Tektur) | `fonts/OFL-Tektur.txt` |
| `fonts/JetBrainsMono-Variable.ttf` | JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) | `fonts/OFL-JetBrainsMono.txt` |

- Тексты OFL взяты из google/fonts: `ofl/tektur/OFL.txt`, `ofl/jetbrainsmono/OFL.txt`.
- Совпадают с метаданными самих TTF (name ID 13/14: «licensed under the SIL Open Font License, Version 1.1»).
- `ui/chip_*.svg` и `ui/btn_*.svg` содержат вшитое подмножество Tektur (WOFF, base64, семейство «LX Tektur»).
  Это модифицированная версия по OFL; Reserved Font Name у Tektur не объявлен. При распространении держать рядом
  `fonts/OFL-Tektur.txt`. Шрифт нельзя продавать отдельно от ПО — к игре это не относится.

## Инструменты сборки (в репозиторий не входят)
headless Chrome + puppeteer-core (Apache-2.0), ffmpeg (LGPL/GPL), Pillow (HPND), fontTools (MIT).
