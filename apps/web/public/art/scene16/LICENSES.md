# LEVEX · scene16 · лицензии

## Графика (собственная работа)
Робот-помощник («сдержанная» и «яркая» радость), искра-импульс, волна купола, жетон вехи (новый уровень), золотая рамка аватара, CSS, моки, доска, GIF и MP4 нарисованы с нуля кодом (inline SVG + CSS) в
`work/robot16.py`, `work/fx16.py` и `work/build16.py`. Основа: собственный робот scene15 (`scene15/work/robot15.py`)
и собственные карта, шапка, табы и шторка чата scene14/15. Сторонних изображений, иконок-паков, стоков и ИИ-генераций нет.
Значок XP в моках `work/ic_reward_main.svg` — копия `apps/web/public/art/scene14/ui/ic_reward.svg` из origin/main, тоже собственная работа scene14.
Права принадлежат проекту LEVEX.

## Шрифты: SIL Open Font License 1.1 (OFL)
- Tektur, Copyright 2023 The Tektur Project Authors. Текст лицензии: `fonts/OFL_Tektur.txt` (из google/fonts).
- JetBrains Mono, Copyright 2020 The JetBrains Mono Project Authors. Текст лицензии: `fonts/OFL_JetBrainsMono.txt` (из google/fonts).
Используются только в PNG, GIF и MP4, где текст растеризован. В SVG из `svg/` текста и шрифтов нет.

## Инструменты сборки (в результат не входят)
puppeteer-core (Apache-2.0, установлен в `/workspace/levex_design/render_tools/`) и headless Google Chrome только рендерят; ffmpeg только кодирует GIF и MP4; Pillow и Python 3 используются для проверок.
В ассеты ничего из этого не попадает, поэтому лицензии инструментов на результат не распространяются.

Состав ассетов: `svg/robot_happy_soft`, `robot_happy_bright`, `fx_spark`, `fx_dome_hit`, `milestone_token`, `chat_avatar_frame_happy` (и копии в `svg/static/`), `svg/levex-happy.css`. Новых сторонних материалов нет.
