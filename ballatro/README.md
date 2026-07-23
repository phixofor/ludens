# 🎱 BALLATRO

A single-file mobile web game that mashes **Holedown**'s squishy ball-bouncing with **Balatro**'s joker-card economy. Break the chips, bank the money, stack five jokers, and survive a boss every 12 rounds.

![Gameplay](screenshots/gameplay.png)

**▶ Play:** `https://USERNAME.github.io/ballatro/` *(live once GitHub Pages is enabled — see below)*

## How to play

- **Drag** anywhere to aim, release to fire your stream of balls.
- **Tap** mid-flight to fast-forward the bounce.
- Clear the chips before they cross the dashed danger line.
- Every 4 rounds the **shop** opens — buy, sell, or reroll jokers. You hold five.
- A **boss brick** drops every 12 rounds. Its armor floors weak hits at 1 damage, so you need damage jokers to punch through before it descends onto you.

## Jokers

Five slots. Eight are pure upside; three (marked ⚠) are double-edged.

| Joker | Effect |
|---|---|
| 💪 Heavy Chips | +1 damage per ball |
| 🎱 Extra Ball | +1 ball each launch |
| 👑 Midas Touch | +50% chips from breaks |
| 🏦 Interest | +1 chip per 5 held at round end (cap +8) |
| ⛓️ Combo | +1 chip per extra break in a turn |
| 🍀 Lucky Chip | 25% chance a break drops +2 |
| 💥 Overkill | wasted kill-damage becomes chips |
| 🎯 Bank Shot | +1 damage per wall bounce |
| 🔦 Laser Sight ⚠ | shows the full reflected aim path, but −25% chips |
| 🔪 Glass Cannon ⚠ | +3 damage, but −2 balls |
| 🎲 High Roller ⚠ | chips ×2, but pay 4 to launch |

Default aim only shows a straight direction ray — Laser Sight is the only way to preview bounces.

## Boss

A full-width, two-row armored brick. Damage per hit is `max(1, ball_damage − armor)`, so a wide spray of base balls barely scratches it. Heavy Chips, Glass Cannon, and Bank Shot are the counters. It drops two extra balls when it dies. HP and armor scale each boss.

## Tech

- One `index.html`. Vanilla JS + Canvas. **No dependencies, no build step, no assets.**
- Real circle-vs-convex-polygon collision so the irregular multi-cell blocks bounce off their actual angled faces.
- WebAudio for all sound (synthesized, nothing to download).
- No `localStorage`, no network calls — fully offline. Drop it on any static host.

## Tuning knobs

The values worth nudging are near the top of the script in `index.html`:

- `spawnBoss()` — boss HP / armor scaling
- `newBlock()` reward multiplier (`0.4`) — chip income
- `cardPrice()` / `sellValue()` — shop economy
- `SPEED` in `resize()` — ball pace

## Deploy on GitHub Pages

After pushing, go to **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` / `/ (root)`, save. The game goes live at `https://USERNAME.github.io/ballatro/`.

## License

MIT — see [LICENSE](LICENSE).
