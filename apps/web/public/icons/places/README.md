# Place icons (map labels)

One SVG per map place, named by the place id used in code
(`packages/domain/src/map.ts`):

| file           | place          | current source (icons2, Lucide)  |
| -------------- | -------------- | -------------------------------- |
| `home.svg`     | Дом            | `house.svg`                      |
| `study.svg`    | Учебный центр  | `book-open.svg`                  |
| `park.svg`     | Парк           | `tree-deciduous.svg`             |
| `workshop.svg` | Мастерская     | `cog.svg`                        |
| `center.svg`   | Центр LEVEX    | `hexagon.svg`                    |

The icons2 copies only swap Lucide's `stroke="currentColor"` for a fixed
identity colour so they render inside `<img>`.

## Swapping to icons3

Drop the new files here under the same five names and keep (or replace)
the license file. Nothing else changes. If the new set lives somewhere
else or uses other names, edit the one map in
`apps/web/src/map/placeIcons.ts` (`PLACE_ICON_DIR` / `PLACE_ICON_FILE`).

## License

Lucide icons, ISC — see `LICENSE-lucide-ISC.txt`.
