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

Five slots, 29 jokers across three rarities. Cards marked ⚠ are double-edged. Shop offers roll **62% common / 30% uncommon / 8% rare** per slot.

### Common (11)

| Joker | Effect |
|---|---|
| 💪 Heavy Chips | +1 damage on every ball |
| 🏦 Interest | +1 chip per 5 held at round end (cap +8) |
| ⛓️ Combo | +1 chip per extra break in a turn |
| 🍀 Lucky Chip | 25% chance a break drops +2 |
| 🔦 Laser Sight ⚠ | shows the full reflected aim path, but −25% chips |
| 🐝 Hive Mind | hexagon chips pay double |
| 🔻 Edge Lord | triangles take +2 damage |
| 🧱 Blockhead | squares pay +4 chips |
| 🗡️ First Blood | first break each launch pays double |
| 🐷 Piggy Bank | +2 chips at round end |
| ♻️ Recycler | rerolls cost 2 less (min 1) |

### Uncommon (11)

| Joker | Effect |
|---|---|
| 🎱 Extra Ball | +1 ball each launch |
| 👑 Midas Touch | +50% chips from breaks |
| 💥 Overkill | wasted kill damage becomes chips |
| 🎯 Bank Shot | +1 damage per wall bounce, **capped at +3 per ball** |
| 🎫 Toll Booth | +1 chip per wall bounce (max 8 per launch) |
| 🎟️ Coupon Book | shop jokers cost 2 less (min 2) |
| 🤹 Juggler | +1 ball per 2 other jokers held |
| ⚓ Anchor Ball | last ball each launch deals bonus damage |
| 🪁 Kite | first ceiling hit per ball: +2 damage |
| 🗝️ Skeleton Key | ignore 2 boss armor |
| 🕯️ Cursed Candle ⚠ | +2 balls, but rows have fewer gaps |

### Rare (7)

| Joker | Effect |
|---|---|
| 🔪 Glass Cannon ⚠ | +3 damage, but −2 balls |
| 🎲 High Roller ⚠ | chips ×2, but pay 4 to launch |
| 👯 Doppelganger | counts as a copy of your leftmost other joker |
| ⚡ Chain Reaction | breaks deal 1 damage to nearby chips |
| ☃️ Snowball | +1 ball damage per 30 chips broken this run |
| 🦈 Loan Shark ⚠ | +30 chips on buy, −2 every round end (floors at 0) |
| 📈 Investor | +15% chip mult per shop visited while held |

Default aim only shows a straight direction ray — Laser Sight is the only way to preview bounces.

### Bank Shot cap

Bank Shot used to add +1 damage per wall bounce with no ceiling, letting one long rally turn a ball into a boss-killer. It's now capped per copy: each copy can add at most **+3 damage total per ball flight** (tracked per-ball, so it resets on the next launch). Stacking two copies raises the cap to +6, so it's still worth building around — just not an auto-win. Toll Booth (the chip-income cousin) keeps its own separate 8-chip-per-launch cap.

## Boss

A full-width, two-row armored brick that arrives every 12 rounds. Damage per hit is `max(1, ball_damage − armor)`, so a wide spray of base balls barely scratches it — Heavy Chips, Glass Cannon, and Bank Shot are the counters, and Skeleton Key directly ignores 2 armor. HP is `70 + (boss_number - 1) * 110`; armor is `1 + boss_number`. It drops two extra balls when it dies.

Boss fights are no longer a breather: while the boss is alive, every even round still spawns a half-HP pressure row, so you're racing the clock instead of stalling for free. Each boss also rolls one modifier, cleared on death:

| Modifier | Effect |
|---|---|
| THE WALL | boss gets +2 armor |
| THE MISER | breaks pay 50% chips while the boss is alive |
| THE MAGNET | the launcher recenters every round |
| THE FOG | no aim line while the boss is alive |

## Tech

- One `index.html`. Vanilla JS + Canvas. **No dependencies, no build step, no assets.**
- Real circle-vs-convex-polygon collision so the irregular multi-cell blocks bounce off their actual angled faces.
- Chips render from a lazily-built, per-tier sprite cache (casino chip look: rim, edge spots, printed ring, sheen) instead of being redrawn as flat polygons every frame.
- WebAudio for all sound (synthesized, nothing to download).
- No `localStorage`, no network calls — fully offline. Drop it on any static host.

## Tuning knobs

The values worth nudging are near the top of the script in `index.html`:

- `spawnRow()` — `baseHp` curve, gap tightening, ball-pickup rate; difficulty ramps quadratically after turn 20 instead of linearly
- `endTurn()` — boss pressure-row cadence (`G.turn%2===0` half-HP rows while a boss is alive)
- `spawnBoss()` — boss HP / armor scaling and the `BOSS_MODS` modifier pool
- `wallHit()` — Bank Shot's per-ball damage cap and Toll Booth's per-launch chip cap
- `newBlock()` reward multiplier (`0.4`) — chip income
- `PRICE` / `cardPrice()` / `sellValue()` — rarity-based shop economy (common/uncommon/rare base prices, coupon and shop-visit discounts, 2-chip price floor)
- `pickRarity()` — shop offer rarity weights (62/30/8)
- `SPEED` in `resize()` — ball pace

## Deploy on GitHub Pages

After pushing, go to **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` / `/ (root)`, save. The game goes live at `https://USERNAME.github.io/ballatro/`.

## License

MIT — see [LICENSE](LICENSE).
