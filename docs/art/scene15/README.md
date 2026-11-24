# scene15 · робот-помощник в приложении — скрины

Экран 390×844, deviceScaleFactor 2 (PNG 780×1688). Локальное превью: vite `--port 5200`, API на 3200.
Весь текст сообщений — ПРИМЕР.

| Файл | Что |
|---|---|
| `01_home_marker_390x844.png` | карта, игрок ещё ни разу не открывал чат: маркер «нажми» над шлемом |
| `02_home_no_marker_390x844.png` | карта после первого открытия чата: маркера нет (`localStorage["levex.assistant.chatOpened"] = "1"`) |
| `03_chat_idle_390x844.png` | чат открыт, поле пустое → idle |
| `04_chat_listening_390x844.png` | игрок печатает → listening, статус «СЛУШАЕТ» |
| `05_chat_thinking_390x844.png` | запрос ушёл, ответа нет → thinking, «ДУМАЕТ», индикатор и кнопка «стоп» |
| `06_chat_speaking_390x844.png` | последний ответ помощника на экране → speaking, «ГОВОРИТ» |
| `07_reduced_motion_home_390x844.png` | `prefers-reduced-motion: reduce`: статичные робот и маркер из `art/scene15/static/` |
| `08_reduced_motion_chat_thinking_390x844.png` | reduced motion в чате: статичные робот, рамка и индикатор |
| `robot_map.gif` | робот на карте: с маркером и без |
| `robot_chat.gif` | аватар в шапке чата: listening → thinking → speaking |

`shots.js` — скрипт puppeteer. thinking и speaking сняты без ИИ-ключа: запрос `POST /assistant/chat`
перехватывается только в браузере puppeteer (`setRequestInterception`). Сначала он удерживается (thinking),
потом получает мок-ответ `{ reply: "ПРИМЕР: …", source: "ok" }` (speaking). Код приложения и API не менялись.

Состояние happy в приложении не используется: когда робот радуется, решает Лия.
