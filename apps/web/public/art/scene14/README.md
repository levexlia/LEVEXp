# art/scene14 — направление X «Неон-кибер»

Тёмно-синий фон, неон фиолетовый→голубой, гексы, контур `#0a1c46`. Купола на гекс-островах зигзагом, без дорог.
Имена мест совпадают с `MapNodeId`: `home`, `study`, `park`, `workshop`, `center`.

| Папка | Что лежит |
|---|---|
| `map/map.svg` | Вся карта 390×844 (фон, сетка, 5 куполов на островах) с CSS-анимацией |
| `domes/{place}_{done,current,available,locked}.svg` | Отдельный купол с островом для каждого места и состояния |
| `places/{place}.svg`, `{place}_locked.svg` | Иконки мест (viewBox 48, читаются от 22 px), анимация 2.4 с внутри SVG |
| `badges/{done,current,available,locked}.svg` | Жетоны состояний |
| `ui/btn_*.svg` | Кнопки: proof, enter, enter_disabled, start, repeat, later (текст + вшитый шрифт) |
| `ui/chip_{place}.svg` | Чипы-подписи мест (иконка 22 px + текст) |
| `ui/ic_*.svg` | UI-иконки (таб-бар, счётчики, check/lock/play/star/replay) |
| `avatar/operator.svg` | Аватар игрока на карте (48×96) |
| `avatar/hex_portrait.svg`, `avatar/hologram.svg` | Запасные варианты аватара |
| `fonts/` | Tektur, JetBrains Mono + OFL |

Токены: `apps/web/src/theme/levex-x.css` (CSS-переменные и классы `.lx-btn`, `.lx-chip`, `.lx-sheet`)
и `apps/web/src/theme/levex-x.tokens.json`. Превью: `docs/art/scene14/`.
