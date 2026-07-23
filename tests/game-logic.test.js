"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const rootHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const deployHtml = fs.readFileSync(path.join(root, "ballatro/index.html"), "utf8");
assert.equal(deployHtml, rootHtml, "the root and deploy copies must stay synchronized");

const scriptMatch = rootHtml.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "game script is present");

function element() {
  const el = {
    children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} },
    addEventListener() {},
    appendChild(child) { this.children.push(child); },
    textContent: "",
    disabled: false,
    onclick: null,
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return this._innerHTML || ""; },
    set(value) { this._innerHTML = value; if (value === "") this.children = []; },
  });
  return el;
}

const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};
const context2d = new Proxy({ setTransform() {} }, { get: (target, key) => target[key] || (() => {}) });
const canvas = getElement("cv");
canvas.getContext = () => context2d;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
const stage = getElement("stage");
stage.clientWidth = 350;
stage.clientHeight = 600;

const sandbox = {
  console,
  document: { getElementById: getElement, createElement: element },
  window: { addEventListener() {}, devicePixelRatio: 1 },
  navigator: {},
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  setTimeout,
  Math,
};
sandbox.globalThis = sandbox;

const instrumented = scriptMatch[1].replace(
  "resize(); renderHand(); requestAnimationFrame(loop);",
  "globalThis.__game={G,bossAlive,breakBlock,sellValue,refreshShop,reset,CARDS,count,ballCount,ballDmg,coinMult,wallHit,spawnRow,spawnBoss,endTurn,hitBlock,cardPrice,buildOffers,bossGeom};"
);
assert.notEqual(instrumented, scriptMatch[1], "game script test hook was installed");
vm.runInNewContext(instrumented, sandbox);

const {
  G, bossAlive, breakBlock, refreshShop, reset,
  CARDS, count, ballCount, ballDmg, coinMult, wallHit,
  spawnRow, spawnBoss, endTurn, hitBlock, cardPrice, buildOffers, bossGeom,
} = sandbox.__game;

/* ---------- deterministic Math.random helper ---------- */
function withRandomSeq(seq, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => { const v = i < seq.length ? seq[i] : 0.5; i++; return v; };
  try { return fn(); } finally { Math.random = real; }
}
// spawnRow's per-column roll order is gap, pick, width, hp; newBlock then rolls
// kind + rot for every chip it creates, so 6 Math.random() calls happen per
// non-gap, non-pickup column. Keep gap/pick/width/kind/rot pinned high (no
// gap, no pickup, no wide chip, arbitrary shape) and only vary the hp roll.
function noGapPattern(cols, hpRoll) {
  const out = [];
  for (let i = 0; i < cols; i++) out.push(0.99, 0.99, 0.99, hpRoll == null ? 0.5 : hpRoll, 0.99, 0.99);
  return out;
}

/* ---------- existing baseline assertions ---------- */
G.blocks = [{ boss: true, dead: true }];
assert.equal(bossAlive(), false, "a destroyed boss must not suppress the next row");
G.blocks.push({ boss: true, dead: false });
assert.equal(bossAlive(), true, "a living boss still suppresses normal rows");

Object.assign(G, { coins: 0, jokers: ["overkill"], particles: [], coinfx: [], floats: [], destroyedThisTurn: 0 });
breakBlock({ boss: false, col: 0, cw: 1, chh: 1, dispRow: 0, hp: 0, reward: 1, _hitDamage: 1, _hpBefore: 1 }, {});
assert.equal(G.coins, 1, "armor-reduced damage must not create fake overkill chips");
Object.assign(G, { coins: 0, particles: [], coinfx: [], floats: [], destroyedThisTurn: 0 });
breakBlock({ boss: false, col: 0, cw: 1, chh: 1, dispRow: 0, hp: 0, reward: 1, _hitDamage: 5, _hpBefore: 1 }, {});
assert.equal(G.coins, 5, "real excess damage still awards overkill chips");

Object.assign(G, { coins: 0, jokers: ["heavy", "rapid", "midas", "interest", "combo"], shopVisits: 1, rerollCost: 3, offers: [] });
refreshShop();
const displayedSellValue = Number(getElement("ownedRow").children[0].innerHTML.match(/\+(\d+)/)[1]);
getElement("ownedRow").children[0].onclick();
assert.equal(G.coins, displayedSellValue, "selling a joker must pay the displayed value");

Object.assign(G, { firstReturnX: 99, fireTimer: 12, shake: 9, rerollCost: 17, offers: ["heavy"] });
reset();
assert.equal(G.firstReturnX, null);
assert.equal(G.fireTimer, 0);
assert.equal(G.shake, 0);
assert.equal(G.rerollCost, 3);
assert.equal(G.offers.length, 0);

/* ---------- CARDS integrity: 29 entries, valid rarity ---------- */
const cardIds = Object.keys(CARDS);
assert.equal(cardIds.length, 29, "roster must have 29 jokers");
const validRar = new Set(["common", "uncommon", "rare"]);
for (const id of cardIds) assert.ok(validRar.has(CARDS[id].rar), `${id} has a valid rarity`);

/* ---------- Bank Shot cap ---------- */
{
  Object.assign(G, { jokers: ["bank"] });
  const ball = { dmg: 1, _bank: 0, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) wallHit(ball);
  assert.equal(ball.dmg, 4, "1 copy of Bank Shot caps at +3 dmg (base 1 -> 4)");
}
{
  Object.assign(G, { jokers: ["bank", "bank"] });
  const ball = { dmg: 1, _bank: 0, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) wallHit(ball);
  assert.equal(ball.dmg, 7, "2 copies of Bank Shot cap at +6 dmg (base 1 -> 7)");
}

/* ---------- Doppelganger counting (no recursion) ---------- */
{
  Object.assign(G, { jokers: ["twins", "twins"] });
  assert.equal(count("twins"), 2, "twins-only hand: no leftmost other, no recursion");
  Object.assign(G, { jokers: ["heavy", "twins"] });
  assert.equal(count("heavy"), 2, "leftmost non-twins joker gains the twins copy");
  assert.equal(count("twins"), 1, "twins itself only counts its raw copies");
  Object.assign(G, { jokers: ["twins", "heavy"] });
  assert.equal(count("heavy"), 2, "twins skips over itself to find the leftmost other joker");
}

/* ---------- rarity pricing + coupon floor ---------- */
{
  Object.assign(G, { shopVisits: 0, jokers: [] });
  assert.equal(cardPrice("heavy"), 4, "common price");
  assert.equal(cardPrice("rapid"), 6, "uncommon price");
  assert.equal(cardPrice("glass"), 9, "rare price");
  Object.assign(G, { jokers: ["coupon", "coupon", "coupon"] });
  assert.equal(cardPrice("heavy"), 2, "coupon discount floors at 2 chips");
}

/* ---------- weighted buildOffers via scripted Math.random ---------- */
{
  Object.assign(G, { coins: 100, jokers: [], offers: [] });
  withRandomSeq([0.0, 0.0, 0.7, 0.0, 0.95, 0.0], () => buildOffers());
  const rarities = G.offers.map(id => String(CARDS[id].rar));
  const expectedRar = ["common", "uncommon", "rare"];
  assert.equal(rarities.length, 3);
  rarities.forEach((r, i) => assert.equal(r, expectedRar[i], "buildOffers rolls map to common/uncommon/rare"));
}

/* ---------- spawnRow HP band at turn 36 ---------- */
{
  Object.assign(G, { turn: 36, blocks: [] });
  withRandomSeq(noGapPattern(7), () => spawnRow());
  assert.equal(G.blocks.length, 7, "no gaps/pickups/wide chips rolled -> one chip per column");
  for (const b of G.blocks) {
    assert.equal(b.type, "chip");
    assert.equal(b.cw, 1);
    assert.equal(b.hp, 25, "baseHp=24 at t=36, mid roll (0.5) -> round(24*1.05)=25");
  }
}

/* ---------- spawnRow gap floor respected ---------- */
{
  Object.assign(G, { turn: 100, blocks: [] });
  withRandomSeq([0.049, ...noGapPattern(6)], () => spawnRow());
  assert.equal(G.blocks[0].col, 1, "gap floor of 0.05 still lets a sub-floor roll skip column 0");
}

/* ---------- spawnBoss at turn 24 ---------- */
{
  Object.assign(G, { turn: 24, blocks: [] });
  withRandomSeq([0.3], () => spawnBoss());
  const boss = G.blocks.find(b => b.boss);
  assert.equal(boss.hp, 180, "boss 2 hp = 70+(2-1)*110");
  assert.equal(G.bossMod, "miser", "roll 0.3 -> BOSS_MODS[1]");
  assert.equal(boss.armor, 3, "non-wall modifier: armor = 1+num, no +2");
}

/* ---------- boss pressure rows during boss fights ---------- */
{
  Object.assign(G, { turn: 21, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  const before = G.blocks.length;
  withRandomSeq(noGapPattern(7), () => endTurn());
  assert.equal(G.turn, 22);
  assert.ok(G.blocks.length > before, "even turn during a boss fight adds a pressure row");
}
{
  Object.assign(G, { turn: 22, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  const before = G.blocks.length;
  endTurn();
  assert.equal(G.turn, 23);
  assert.equal(G.blocks.length, before, "odd turn during a boss fight adds no blocks");
}

/* ---------- Skeleton Key reduces effective boss armor ---------- */
{
  Object.assign(G, { destroyedThisTurn: 0, floats: [], coinfx: [], particles: [] });
  const b1 = { boss: true, dead: false, hp: 100, maxhp: 100, armor: 5, row: 0, rowSpan: 2, dispRow: 0 };
  const g1 = bossGeom(b1);
  const ball1 = { x: g1.cx, y: g1.cy, vx: 1, vy: 1, r: 5, dmg: 10 };
  Object.assign(G, { jokers: [] });
  hitBlock(ball1, b1);
  assert.equal(b1.hp, 95, "no skeleton key: eff dmg = max(1, 10-5) = 5");

  const b2 = { boss: true, dead: false, hp: 100, maxhp: 100, armor: 5, row: 0, rowSpan: 2, dispRow: 0 };
  const g2 = bossGeom(b2);
  const ball2 = { x: g2.cx, y: g2.cy, vx: 1, vy: 1, r: 5, dmg: 10 };
  Object.assign(G, { jokers: ["skeleton", "skeleton"] });
  hitBlock(ball2, b2);
  assert.equal(b2.hp, 91, "2 copies ignore 4 armor: eff dmg = max(1, 10-1) = 9");

  const b3 = { boss: true, dead: false, hp: 100, maxhp: 100, armor: 3, row: 0, rowSpan: 2, dispRow: 0 };
  const g3 = bossGeom(b3);
  const ball3 = { x: g3.cx, y: g3.cy, vx: 1, vy: 1, r: 5, dmg: 10 };
  Object.assign(G, { jokers: ["skeleton", "skeleton"] });
  hitBlock(ball3, b3);
  assert.equal(b3.hp, 100 - 10, "armor fully negated (3 <= 2*2) -> full ball dmg through");
}

/* ---------- Loan Shark drain never goes below 0 ---------- */
{
  Object.assign(G, { turn: 22, coins: 1, jokers: ["loanshark", "loanshark"], shopVisits: 0,
    floats: [], coinfx: [], blocks: [] });
  endTurn();
  assert.equal(G.coins, 0, "loan shark drain floors at 0 coins");
}

/* ---------- Snowball scaling ---------- */
{
  Object.assign(G, { jokers: ["snowball"], stats: { broken: 29 } });
  assert.equal(ballDmg(), 1, "29 broken: below the 30-chip threshold, no bonus yet");
  Object.assign(G, { stats: { broken: 30 } });
  assert.equal(ballDmg(), 2, "30 broken: +1 ball dmg kicks in");
  Object.assign(G, { stats: { broken: 90 } });
  assert.equal(ballDmg(), 4, "90 broken: +3 ball dmg (3 thresholds crossed)");
}

/* ---------- sanity checks on the rest of the exported surface ---------- */
{
  Object.assign(G, { jokers: ["rapid", "rapid"], bonusBalls: 0 });
  assert.equal(ballCount(), 6, "2x Extra Ball: 4 base + 2");
  Object.assign(G, { jokers: ["midas"], jstate: {}, bossMod: null, blocks: [] });
  assert.equal(coinMult(), 1.5, "1x Midas Touch: +50% chips");
}

console.log("game logic tests: ok");
