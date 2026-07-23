# 🎱 BALLATRO

A single-file mobile web game that mashes **Holedown**'s squishy ball-bouncing with **Balatro**'s joker-card economy. Break the chips, bank the money, stack five jokers, and survive a boss every 12 rounds.

![Gameplay](ballatro/screenshots/gameplay.png)

**▶ Play:** `https://USERNAME.github.io/ballatro/` *(live once GitHub Pages is enabled — see below)*

## How to play

- **Drag** anywhere to aim, release to fire your stream of balls.
- **Tap** mid-flight to fast-forward the bounce.
- Clear the chips before they cross the dashed danger line. **Chips are supported by anchors** — the top row (newest, attached to the ceiling) and the boss (if alive). Break a chip holding up a cluster and the rest **fall off the board**, paying out their value. This is the core skill: aim for the load-bearing block, not the stack above it.
- Every 4 rounds the **shop** opens — buy, sell, or reroll jokers. You hold five. After round 12, the shop also sells **Ball Packs** for permanent +1 ball (+10 chips first, +6 each after).
- A **boss brick** drops every 12 rounds. Its armor floors weak hits at 1 damage, so you need damage jokers to punch through before it descends onto you.

## Tables & Win Condition

Progress through eight named casino floors, each ending with a boss encounter. Beat **The House** (Table 8) to win the run. Clear a table, bank your earnings in the cash-out ceremony, and advance to the next.

| Table | Rounds | Boss |
|---|---|---|
| Penny Slots | 1–12 | Boss 1 |
| Main Floor | 13–24 | Boss 2 |
| High Limit | 25–36 | Boss 3 |
| VIP Room | 37–48 | Boss 4 |
| Whale Tank | 49–60 | Boss 5 |
| The Vault | 61–72 | Boss 6 |
| Owner's Suite | 73–84 | Boss 7 |
| The House | 85–96 | Boss 8 |

**Win condition:** Defeat the boss at the end of Table 8. You'll see a "YOU BEAT THE HOUSE" screen with your final stats. Choose to continue into **Overtime** (endless tables, numbered 9+) or start a fresh run.

**Cash-out ceremony:** When you clear a table, the board pauses and a staggered overlay shows your earnings: chips broken, chips cut (from cascades), crits landed, boss bonus, and a table clear bonus (scales with table difficulty). Bank it all and advance.

**Depth-meter HUD:** The top stat now shows your table name and progress (`X/12` rounds), with a gold bar filling as you advance. When a boss is alive, the bar turns red and the label reads `BOSS`, showing remaining HP.

## Jokers

Five slots, 89 jokers across four rarities. Shop offers roll **55% common / 32% uncommon / 11% rare / 2% legendary** per slot. Cards marked ⚠ are double-edged.

### Rarity tiers & distribution

- **Common (40)** — Basic +1/+2 effects or narrow conditionals. Build the foundation.
- **Uncommon (30)** — ×2 conditionals, +2–3 flats, or small chains. Start synergies.
- **Rare (15)** — Build-arounds, scaling mechanics, or aggressive caps. Game-shifters.
- **Legendary (4)** — Run-defining effects that alter how you play. Rare finds.

### Representative jokers

| Joker | Effect | Rarity |
|---|---|---|
| 💪 Heavy Chips | +1 damage on every ball | Common |
| 🏦 Interest | +1 chip per 5 held at round end (cap +8) | Common |
| 🔦 Laser Sight ⚠ | shows the full reflected aim path, but −25% chips | Common |
| 🎱 Extra Ball | +1 ball each launch | Uncommon |
| 👑 Midas Touch | +50% chips from breaks | Uncommon |
| 🎯 Bank Shot | +1 damage per side-wall bounce (max +3) | Uncommon |
| 🔪 Glass Cannon ⚠ | +3 damage, but −2 balls | Rare |
| ⚡ Chain Reaction | breaks deal 1 damage to nearby chips | Rare |
| 🃏 Wild Card | counts as one copy of every other joker you hold | Legendary |
| 👻 Ghost Chip | balls always pierce killed chips | Legendary |

Default aim only shows a straight direction ray — Laser Sight is the only way to preview bounces.

## Combo Counter

When you destroy 3+ chips in a single turn, a pulsing gold **COMBO ×N** appears at the top of the screen, celebrating your momentum. The number rises with each additional chip destroyed that turn. Combined with turn receipts (which show chip-break and cut counts for large turns), combos reward aggressive, synergistic play.

### Bank Shot & wall bounces

Bank Shot adds +1 damage per side-wall bounce (left/right walls), capped at **+3 damage per ball flight**. The ceiling no longer counts — near-vertical farming was the exploit. Each copy of Bank Shot raises the cap by 3, so two copies can add up to +6 total. Stacking is still worth building around. Toll Booth (the chip-income cousin) keeps its own separate cap, and Kite retains its first-ceiling-hit niche.

## Boss

A full-width, two-row armored brick that arrives every 12 rounds. Damage per hit is `max(1, ball_damage − armor)`, so a wide spray of base balls barely scratches it — Heavy Chips, Glass Cannon, and Bank Shot are the counters, and Skeleton Key directly ignores 2 armor. HP is `baseHp(12*num)*10`; armor is `1 + boss_number`. It drops two extra balls when it dies.

Boss fights are no longer a breather: while the boss is alive, every even round still spawns a half-HP pressure row, so you're racing the clock instead of stalling for free. Each boss also rolls one modifier, cleared on death:

| Modifier | Effect |
|---|---|
| THE WALL | boss gets +2 armor |
| THE MISER | breaks pay 50% chips while the boss is alive |
| THE MAGNET | the launcher recenters every round |
| THE FOG | no aim line while the boss is alive |

Chip HP has gotten much tougher. From round 8–10 on, a single launch clears only ~50–70% of a fresh row — full clears become rare, and you'll triage which blocks to target while letting the rest descend.

## Meta-Progression

Your best moments are saved. The game tracks best table reached, longest run, best earnings, and lifetime stats (total chips broken, ball launches, boss kills). On the start screen, a persistent line shows your previous run's best: *"Best: Table N · Depth M"*.

### Locked Jokers & Achievements

Fourteen rare and legendary jokers are locked behind achievements, encouraging long-term play and varied strategies:

| Joker | Rarity | Unlock Condition |
|---|---|---|
| 👯 Twins | Rare | Reach Table 2 |
| ⛓️ Chain | Rare | Reach Table 3 |
| 🔗 Snowball | Rare | Reach Table 4 |
| 🏛️ Phalanx | Rare | Reach Table 5 |
| 💼 Investor | Rare | Reach Table 6 |
| 🪞 Hall of Mirrors | Rare | Reach Table 7 |
| 🎯 Headhunter | Rare | Defeat your first boss |
| 💥 Shatterpoint | Rare | Break a 5+ chip cascade in one turn |
| ⏰ Timebomb | Rare | Launch 50 balls (lifetime) |
| 🏔️ Avalanche | Rare | Break 500 chips (lifetime) |
| 🃏 Wild Card (leg) | Legendary | Beat Table 8 (The House) |
| 👻 Ghost Chip (leg) | Legendary | Defeat 3 bosses (lifetime) |
| 💰 Jackpot (leg) | Legendary | Bank 500 chips in a single run |
| ♻️ Ouroboros (leg) | Legendary | Break 1000 chips (lifetime) |

Locked jokers don't appear in the shop until unlocked. The pool remains healthy — a core set of commons and uncommons is always available, and rares/legendaries unlock progressively as you play.

## Tech

- One `index.html`. Vanilla JS + Canvas. **No dependencies, no build step, no assets.**
- Real circle-vs-convex-polygon collision so the irregular multi-cell blocks bounce off their actual angled faces.
- Chips render from a lazily-built, per-tier sprite cache (casino chip look: rim, edge spots, printed ring, sheen) instead of being redrawn as flat polygons every frame.
- WebAudio for all sound (synthesized, nothing to download).
- `localStorage` for meta-progression (best table, lifetime stats, unlocked joker IDs); in-memory fallback if unavailable. No network calls — fully offline except for persistence. Drop it on any static host.

## Tuning knobs

The values worth nudging are near the top of the script in `index.html`:

- `spawnRow()` — `baseHp(t) = 1 + round(t^1.3 / 2.6)` (difficulty curve; drop divisor toward 2.2 to harden further); gap tightening `(0.8+rand*0.4)`; ball-pickup rate
- `endTurn()` — boss pressure-row cadence (`G.turn%2===0` half-HP rows while a boss is alive)
- `spawnBoss()` — boss HP / armor scaling and the `BOSS_MODS` modifier pool
- `wallHit()` — Bank Shot's per-ball damage cap (+3 per copy) and Toll Booth's per-launch chip cap (4)
- `REWARD` table — block payouts by denomination tier (indexed 0–5 for chips ≤1, ≤3, ≤6, ≤10, ≤16, ∞ HP)
- `PRICE` / `cardPrice()` / `sellValue()` — rarity-based shop economy (common/uncommon/rare/legendary base prices, growth +1 per shop visit, coupon/pack discounts, 2-chip floor)
- `pickRarity()` — shop offer rarity weights (55/32/11/2)
- `ballCount()` / `spawnBall()` — Ball Pack stacking and ball-spawn mechanics
- `SPEED` in `resize()` — ball pace
- `checkSupport()` — anchor adjacency and falling-cluster payout

## Deploy on GitHub Pages

After pushing, go to **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` / `/ (root)`, save. The game goes live at `https://USERNAME.github.io/ballatro/`.

## License

MIT — see [LICENSE](ballatro/LICENSE).
