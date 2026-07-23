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
  "globalThis.__game={G,bossAlive,breakBlock,sellValue,refreshShop,renderShop,reset,CARDS,count,ballCount,ballDmg,coinMult,wallHit,spawnRow,spawnBoss,endTurn,hitBlock,cardPrice,buildOffers,bossGeom,checkSupport,checkLoss,critChance,pierceChance,baseHpAt,newBlock,ballPackPrice,rerollPrice,openShop,update,fire,resize,bx,by,tableClearBonus,beginTable,enterCashout,computeCashoutTally,loadMeta,saveMeta,clearMeta,isUnlocked,checkAchievements,LOCKED_JOKERS,tableName,pickOffer,storageGet,storageSet,META_KEY,advanceToNextTable};"
);
assert.notEqual(instrumented, scriptMatch[1], "game script test hook was installed");
vm.runInNewContext(instrumented, sandbox);

const {
  G, bossAlive, breakBlock, refreshShop, renderShop, reset,
  CARDS, count, ballCount, ballDmg, coinMult, wallHit,
  spawnRow, spawnBoss, endTurn, hitBlock, cardPrice, buildOffers, bossGeom, checkSupport, checkLoss,
  critChance, pierceChance, baseHpAt, newBlock, ballPackPrice, rerollPrice, openShop, update, fire, resize, bx, by,
  tableClearBonus, beginTable, enterCashout, computeCashoutTally, loadMeta, saveMeta, clearMeta,
  isUnlocked, checkAchievements, LOCKED_JOKERS, tableName, pickOffer, storageGet, storageSet, META_KEY, advanceToNextTable,
} = sandbox.__game;

resize();

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
// breakBlock's VFX (shardBurst/burst) also draws from Math.random for cosmetic
// angle/speed, so a killing hit consumes an unpredictable number of rolls before
// the pierce/crit check. Pin every roll to the same constant to make the
// mechanic-relevant roll deterministic regardless of VFX call count.
function withConstantRandom(v, fn) {
  const real = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = real; }
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

/* ---------- lethal-state invariants ---------- */
{
  Object.assign(G, { jokers: ["dud", "dud"], stats: { broken: 0 }, jstate: {} });
  assert.equal(ballDmg(), 1, "downside jokers must never create zero or healing ball damage");
}
{
  Object.assign(G, { jokers: ["hardhat"], destroyedThisTurn: 0, tstats: { broken: 0, cut: 0, crits: 0 } });
  const block = newBlock(2, 3, 3, "chip", 1, 1);
  const ball = { x: bx(block), y: by(block), vx: 0, vy: -1, r: 2, dmg: 1, idx: 0, anchor: false };
  withConstantRandom(0.99, () => hitBlock(ball, block));
  assert.equal(block.hp, 2, "Hard Hat's chip penalty must floor at one damage");
}
{
  Object.assign(G, { screen: "play", blocks: [{ boss: false, type: "chip", dead: true, row: 999 }] });
  assert.equal(checkLoss(), false, "a chip destroyed on the danger line must not cause game over before cleanup");
}
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [], destroyedThisTurn: 0,
    stats: { broken: 0 }, tstats: { broken: 0, cut: 0, crits: 0 }, newUnlocksThisRun: [] });
  const block = { boss: false, dead: false, row: 0, hp: 0, maxhp: 1, reward: 1, dispRow: 0,
    col: 0, cw: 1, chh: 1, kind: "square" };
  breakBlock(block, null);
  breakBlock(block, null);
  assert.equal(G.coins, 1, "the same destroyed chip can only pay once");
  assert.equal(G.stats.broken, 1, "the same destroyed chip can only increment stats once");
}
{
  Object.assign(G, { coins: 0, jokers: ["blastcap"], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 }, tstats: { broken: 0, cut: 0, crits: 0 },
    blocks: [
      { col: 1, row: 2, cw: 1, chh: 1, type: "chip", boss: false, dead: false, hp: 2, maxhp: 2, reward: 1, rot: 0, kind: "square", dispRow: 2 },
      { col: 2, row: 2, cw: 1, chh: 1, type: "chip", boss: false, dead: false, hp: 1, maxhp: 1, reward: 1, rot: 0, kind: "square", dispRow: 2 },
    ] });
  checkSupport();
  assert.equal(G.coins, 2, "a splash-killed chip in a falling cluster must not also receive a detach payout");
  assert.equal(G.stats.broken, 2, "a splash-killed falling chip is counted exactly once");
}

/* ---------- CARDS integrity: 89 entries, valid rarity ---------- */
const cardIds = Object.keys(CARDS);
assert.equal(cardIds.length, 89, "roster must have 89 jokers");
const validRar = new Set(["common", "uncommon", "rare", "legendary"]);
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
    assert.equal(b.hp, 42, "baseHpAt(36)=42, mid roll (0.5) -> round(42*1.0)=42");
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
  assert.equal(boss.hp, 250, "boss 2 hp = baseHpAt(24)*10 = 25*10");
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

/* ---------- checkSupport: structural detach ---------- */
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 },
    blocks: [
      { col: 0, row: 0, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
      { col: 3, row: 2, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
    ] });
  const detached = checkSupport();
  assert.equal(detached, true, "an isolated chip with no anchor chain detaches");
  assert.equal(G.blocks[0].dead, false, "row-0 anchor chip stays");
  assert.equal(G.blocks[1].dead, true, "unsupported chip is marked dead");
  assert.equal(G.coins, 2, "detached chip pays its tier reward");
  assert.equal(G.particles.length, 1, "a faller particle is spawned");
  assert.equal(G.particles[0].kind, "faller");
}
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 },
    blocks: [
      { col: 0, row: 0, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
      { col: 0, row: 1, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
    ] });
  const detached = checkSupport();
  assert.equal(detached, false, "a chip chained to a row-0 anchor stays supported");
  assert.equal(G.blocks[1].dead, false);
}
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 },
    blocks: [
      { boss: true, dead: false, row: 3, rowSpan: 2, hp: 50, armor: 1, dispRow: 3 },
      { col: 2, row: 5, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
    ] });
  const detached = checkSupport();
  assert.equal(detached, false, "a live boss anchors chips row-adjacent to it");
  assert.equal(G.blocks[1].dead, false);
}

/* ---------- reward table by tier ---------- */
{
  const hps = [1, 3, 6, 10, 16, 40], expectedReward = [1, 1, 2, 2, 3, 4];
  hps.forEach((hp, i) => {
    const b = newBlock(0, 0, hp, "chip", 1, 1);
    assert.equal(b.reward, expectedReward[i], `hp=${hp} pays tier reward ${expectedReward[i]}`);
  });
}

/* ---------- baseHp curve spot values ---------- */
{
  const spots = { 1: 1, 2: 2, 3: 3, 4: 3, 17: 16, 40: 48 };
  for (const [t, expected] of Object.entries(spots)) {
    assert.equal(baseHpAt(Number(t)), expected, `baseHpAt(${t}) === ${expected}`);
  }
}

/* ---------- boss hp = baseHpAt(12*num)*10 across multiple boss numbers ---------- */
{
  Object.assign(G, { turn: 12, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.blocks.find(b => b.boss).hp, 110, "boss 1 hp = baseHpAt(12)*10");
}
{
  Object.assign(G, { turn: 48, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.blocks.find(b => b.boss).hp, 600, "boss 4 hp = baseHpAt(48)*10");
}

/* ---------- Bank Shot: ceiling hits never trigger the bonus ---------- */
{
  Object.assign(G, { jokers: ["bank"] });
  const ball = { dmg: 1, _bank: 0, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) wallHit(ball, true);
  assert.equal(ball.dmg, 1, "10 ceiling-only hits add 0 bank-shot damage");
}

/* ---------- Toll Booth caps at 4 per launch regardless of copies ---------- */
{
  Object.assign(G, { jokers: ["toll"], tollThisLaunch: 0, coins: 0, coinfx: [] });
  const ball = { x: 0, y: 0 };
  for (let i = 0; i < 10; i++) wallHit(ball);
  assert.equal(G.tollThisLaunch, 4, "toll booth caps at 4 wall bounces per launch");
  assert.equal(G.coins, 4, "1 copy of toll: 1 chip per counted bounce, capped at 4");
}
{
  Object.assign(G, { jokers: ["toll", "toll"], tollThisLaunch: 0, coins: 0, coinfx: [] });
  const ball = { x: 0, y: 0 };
  wallHit(ball); wallHit(ball); wallHit(ball);
  assert.equal(G.tollThisLaunch, 4, "2 copies still cap the counter at 4");
  assert.equal(G.coins, 4, "2 copies still cap total chips at 4 (first bounce pays 2, second pays 2, third pays 0)");
}

/* ---------- pricing: legendary tier + visit growth + coupon floor ---------- */
{
  Object.assign(G, { shopVisits: 0, jokers: [] });
  assert.equal(cardPrice("wildcard"), 25, "legendary base price is 25");
  Object.assign(G, { shopVisits: 5, jokers: [] });
  assert.equal(cardPrice("wildcard"), 30, "price grows +1 per shop visit");
  Object.assign(G, { shopVisits: 5, jokers: ["coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon", "coupon"] });
  assert.equal(cardPrice("heavy"), 2, "coupon discount still floors at 2 even with many copies");
}

/* ---------- reroll base persists (a function of cumulative shopVisits) ---------- */
{
  Object.assign(G, { shopVisits: 0, coins: 10000, jokers: [], offers: [], jstate: {} });
  openShop();
  assert.equal(G.shopVisits, 1);
  assert.equal(G.rerollCost, 3, "visit 1: min(11,3+floor(1/2))=3");
  openShop();
  assert.equal(G.shopVisits, 2);
  assert.equal(G.rerollCost, 4, "visit 2: 3+floor(2/2)=4");
  for (let i = 0; i < 8; i++) openShop();
  assert.equal(G.shopVisits, 10);
  assert.equal(G.rerollCost, 8, "visit 10: 3+floor(10/2)=8, persists across visits rather than resetting to 3");
  assert.equal(rerollPrice(), 8, "no recycler/highstakes/freebie: reroll price equals the base");
}

/* ---------- Ball Pack: price escalation + bonusBalls effect ---------- */
{
  Object.assign(G, { jstate: {} });
  assert.equal(ballPackPrice(), 10, "first ball pack costs 10");
  Object.assign(G, { jstate: { ballPacks: 1 } });
  assert.equal(ballPackPrice(), 16, "second ball pack costs 16");
  Object.assign(G, { jstate: { ballPacks: 2 } });
  assert.equal(ballPackPrice(), 22, "third ball pack costs 22");

  Object.assign(G, { jokers: [], bonusBalls: 0 });
  const baseBalls = ballCount();
  Object.assign(G, { coins: 20, offers: [], jstate: {}, bonusBalls: 0 });
  renderShop();
  const shopCardsEl = getElement("shopCards");
  const bpCard = shopCardsEl.children[shopCardsEl.children.length - 1];
  bpCard.onclick();
  assert.equal(G.coins, 10, "buying the first ball pack costs 10 chips");
  assert.equal(G.jstate.ballPacks, 1);
  assert.equal(G.bonusBalls, 1);
  assert.equal(ballCount(), baseBalls + 1, "bonusBalls grants +1 ball permanently");
  bpCard.onclick();
  assert.equal(G.coins, 10, "insufficient chips (price now 16): purchase is a no-op");
  assert.equal(G.jstate.ballPacks, 1, "no second purchase happened");
  Object.assign(G, { coins: 16 });
  bpCard.onclick();
  assert.equal(G.jstate.ballPacks, 2, "second purchase succeeds once affordable");
  assert.equal(G.bonusBalls, 2);
}

/* ---------- interest divisor 8 ---------- */
{
  Object.assign(G, { turn: 5, coins: 40, jokers: ["interest"], shopVisits: 0, floats: [], coinfx: [],
    blocks: [], jstate: {}, stats: { broken: 0 }, bossMod: null });
  endTurn();
  assert.equal(G.coins, 45, "interest divisor 8: floor(40/8)=5 gained");
}
{
  Object.assign(G, { turn: 5, coins: 100, jokers: ["interest"], shopVisits: 0, floats: [], coinfx: [],
    blocks: [], jstate: {}, stats: { broken: 0 }, bossMod: null });
  endTurn();
  assert.equal(G.coins, 108, "interest still caps at +8 even with 64+ held");
}

/* ---------- High Roller: x1.5 chips, pay 6 to launch ---------- */
{
  Object.assign(G, { jokers: ["highroller"], jstate: {}, bossMod: null, blocks: [] });
  assert.equal(coinMult(), 1.5, "high roller: chips x1.5");
}
{
  Object.assign(G, { screen: "play", dir: { x: 0, y: -1 }, balls: [], queue: [],
    jokers: ["highroller"], coins: 10, jstate: {}, bossMod: null, blocks: [] });
  fire();
  assert.equal(G.coins, 4, "high roller costs 6 chips per launch (10-6=4)");
}

/* ---------- checkSupport: cascade drops a whole cluster in one update() pass ---------- */
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 }, screen: "start", shake: 0,
    blocks: [
      // connector already broken this frame (dead); a 3-chip cluster hangs off it with no other anchor
      { col: 1, row: 0, cw: 1, chh: 1, dispRow: 0, type: "chip", boss: false, dead: true, hp: 0, reward: 2, rot: 0 },
      { col: 1, row: 1, cw: 1, chh: 1, dispRow: 1, type: "chip", boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
      { col: 0, row: 2, cw: 1, chh: 1, dispRow: 2, type: "chip", boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
      { col: 2, row: 2, cw: 1, chh: 1, dispRow: 2, type: "chip", boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
    ] });
  G._died = true;
  update(0);
  const survivors = G.blocks.filter(b => !b.dead);
  assert.equal(survivors.length, 0, "cutting the connector drops the whole 3-chip cluster in one update() pass");
  assert.equal(G.destroyedThisTurn, 3, "3 chips detached");
  assert.equal(G.stats.broken, 3);
  assert.equal(G.coins, 6, "3 chips x reward 2 = 6 chips paid");
  assert.equal(G.particles.filter(p => p.kind === "faller").length, 3, "3 faller particles spawned");
}

/* ---------- roster integrity: unique ids/names/icons, every id referenced in a hook ---------- */
{
  const seenNames = new Set(), seenIcons = new Set();
  for (const id of cardIds) {
    const c = CARDS[id];
    assert.ok(!seenNames.has(c.nm), `duplicate joker name: ${c.nm}`);
    seenNames.add(c.nm);
    assert.ok(!seenIcons.has(c.ic), `duplicate joker icon: ${c.ic} (${id})`);
    seenIcons.add(c.ic);
    assert.ok(c.ds && typeof c.ds === "string" && c.ds.length > 0, `${id} has a description`);
  }
  const legendaryIds = cardIds.filter(id => CARDS[id].rar === "legendary");
  assert.equal(legendaryIds.length, 4, "exactly 4 legendary jokers");
  // every joker id must be referenced (quoted) somewhere in the script outside its own
  // unquoted CARDS key definition -- i.e. it is wired into at least one game-logic hook.
  for (const id of cardIds) {
    const re = new RegExp(`['"]${id}['"]`, "g");
    const matches = scriptMatch[1].match(re) || [];
    assert.ok(matches.length >= 1, `joker id "${id}" is never referenced by a hook`);
  }
}

/* ---------- Wild Card + Doppelganger recursion safety ---------- */
{
  Object.assign(G, { jokers: ["wildcard", "twins", "heavy"] });
  assert.equal(count("heavy"), 2, "heavy: raw 1 + wildcard copy 1 = 2");
  assert.equal(count("twins"), 2, "twins: raw 1 + wildcard copy 1 = 2");
  assert.equal(count("wildcard"), 2, "wildcard: raw 1 + twins copy (leftmost-other is wildcard) = 2");

  Object.assign(G, { jokers: ["wildcard", "wildcard", "twins", "twins", "heavy"] });
  assert.equal(count("heavy"), 3, "heavy: raw 1 + 2 wildcard copies = 3");
  assert.equal(count("wildcard"), 4, "wildcard: raw 2 + 2 twins copies = 4");
  assert.equal(count("twins"), 4, "twins: raw 2 + 2 wildcard copies = 4");
  // all of the above complete synchronously with finite results -- recursion guard holds.
}

/* ---------- crit / pierce determinism via scripted Math.random ---------- */
{
  assert.equal(critChance(), 0, "no crit jokers -> 0 chance");
  Object.assign(G, { jokers: ["flint"] });
  assert.equal(critChance(), 0.03, "1 copy of flint: 3% crit chance");
  Object.assign(G, { jokers: ["flint", "flint"] });
  assert.equal(critChance(), 0.06, "2 copies of flint: 6% crit chance");
  Object.assign(G, { jokers: ["headhunter"] });
  assert.equal(critChance(), 0.15, "headhunter: 15% crit chance");

  Object.assign(G, { jokers: [] });
  assert.equal(pierceChance(), 0, "no pierce jokers -> 0 chance");
  Object.assign(G, { jokers: ["arrowhead", "arrowhead"] });
  assert.equal(pierceChance(), 0.08, "2 copies of arrowhead: 8% pierce chance");
  Object.assign(G, { jokers: ["ghostchip"] });
  assert.equal(pierceChance(), 1, "ghost chip forces guaranteed pierce");
}
{
  // crit doubles damage when the scripted roll lands under critChance()
  Object.assign(G, { jokers: ["flint"], destroyedThisTurn: 0, particles: [], floats: [], coinfx: [],
    coins: 0, stats: { broken: 0 } });
  const b = newBlock(2, 5, 100, "chip", 1, 1);
  const ball = { x: bx(b), y: by(b), vx: 0, vy: -1, r: 2, dmg: 5, idx: 0, anchor: false };
  withRandomSeq([0.02], () => hitBlock(ball, b));
  assert.equal(b.hp, 90, "crit roll under 3% doubles 5 dmg to 10 (100-10=90)");
}
{
  Object.assign(G, { jokers: ["flint"], destroyedThisTurn: 0, particles: [], floats: [], coinfx: [],
    coins: 0, stats: { broken: 0 } });
  const b = newBlock(2, 5, 100, "chip", 1, 1);
  const ball = { x: bx(b), y: by(b), vx: 0, vy: -1, r: 2, dmg: 5, idx: 0, anchor: false };
  withRandomSeq([0.9], () => hitBlock(ball, b));
  assert.equal(b.hp, 95, "crit roll over 3% does not double: plain 5 dmg (100-5=95)");
}
{
  // pierce keeps the ball's incoming velocity instead of bouncing, when the scripted roll hits
  Object.assign(G, { jokers: ["ricochet"], destroyedThisTurn: 0, particles: [], floats: [], coinfx: [],
    coins: 0, stats: { broken: 0 } });
  const b = newBlock(2, 5, 1, "chip", 1, 1);
  const ball = { x: bx(b), y: by(b), vx: 3, vy: 4, r: 2, dmg: 5, idx: 0, anchor: false };
  withConstantRandom(0.01, () => hitBlock(ball, b));
  assert.ok(Math.abs(ball.vx - 3) < 1e-9, "pierce roll under 8%: ball keeps its incoming vx");
  assert.ok(Math.abs(ball.vy - 4) < 1e-9, "pierce roll under 8%: ball keeps its incoming vy");
}
{
  Object.assign(G, { jokers: ["ricochet"], destroyedThisTurn: 0, particles: [], floats: [], coinfx: [],
    coins: 0, stats: { broken: 0 } });
  const b = newBlock(2, 5, 1, "chip", 1, 1);
  const ball = { x: bx(b), y: by(b), vx: 3, vy: 4, r: 2, dmg: 5, idx: 0, anchor: false };
  withConstantRandom(0.99, () => hitBlock(ball, b));
  assert.ok(ball.vx !== 3 || ball.vy !== 4, "pierce roll over 8%: ball bounces (velocity reflected, not preserved)");
}

/* ---------- double-boss guard: a surviving boss never gets a second boss stacked ---------- */
{
  Object.assign(G, { turn: 23, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  endTurn();
  assert.equal(G.turn, 24, "endTurn advances the turn counter");
  const bosses = G.blocks.filter(b => b.boss);
  assert.equal(bosses.length, 1, "a surviving boss at the turn-24 boundary must not spawn a second boss");
}

/* ---------- two boss mods at num>=5, none below the threshold ---------- */
{
  Object.assign(G, { turn: 60, blocks: [] });
  withRandomSeq([0.3, 0.1], () => spawnBoss());
  assert.ok(G.bossMod2, "boss number 5 (turn 60) rolls a second mod");
  assert.notEqual(G.bossMod2, G.bossMod, "the two boss mods are always distinct");
}
{
  Object.assign(G, { turn: 48, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.bossMod2, null, "boss number 4 (turn 48) stays below the two-mod threshold");
}

/* ---------- cash-out: boss-kill bonus + tally math ---------- */
{
  clearMeta();
  Object.assign(G, { table: 3, tstats: { broken: 5, cut: 2, crits: 1 }, pendingCashout: null, coins: 0,
    jokers: [], particles: [], floats: [], coinfx: [], destroyedThisTurn: 0, stats: { broken: 0 },
    bossKillsThisRun: 0, bossMod: null, bossMod2: null, blocks: [], newUnlocksThisRun: [] });
  const boss = { boss: true, dead: false, hp: 0, maxhp: 100, reward: 20, row: 0, rowSpan: 2, dispRow: 0, col: 0, cw: 1, chh: 1 };
  breakBlock(boss, null);
  assert.ok(G.pendingCashout, "boss death sets pendingCashout");
  const expectedBonus = Math.round(20 * coinMult());
  assert.equal(G.pendingCashout.bossBonus, expectedBonus, "bossBonus equals the computed coin value from the kill");
  const tally = computeCashoutTally();
  assert.equal(tally.broken, G.tstats.broken);
  assert.equal(tally.cut, G.tstats.cut);
  assert.equal(tally.crits, G.tstats.crits);
  assert.equal(tally.bossBonus, G.pendingCashout.bossBonus);
  assert.equal(tally.clearBonus, tableClearBonus(G.table), "computeCashoutTally's clearBonus matches tableClearBonus(G.table)");
  clearMeta();
}

/* ---------- enterCashout: consumes pendingCashout, banks the clear bonus, advances turn ---------- */
{
  Object.assign(G, { table: 2, turn: 9, tstats: { broken: 3, cut: 1, crits: 0 }, pendingCashout: { bossBonus: 15 },
    coins: 100, screen: 'play', coinfx: [] });
  enterCashout();
  assert.equal(G.turn, 10, "enterCashout increments turn");
  assert.equal(G.screen, 'cashout', "enterCashout switches to the cashout screen");
  assert.equal(G.pendingCashout, null, "pendingCashout is consumed");
  assert.equal(G.coins, 100 + tableClearBonus(2), "the table clear bonus is banked");
}

/* ---------- beginTable: authoritative table state + per-table stat reset ---------- */
{
  Object.assign(G, { table: 1, blocks: [], turn: 1 });
  beginTable(3);
  assert.equal(G.table, 3, "beginTable sets G.table");
  assert.equal(JSON.stringify(G.tstats), JSON.stringify({ broken: 0, cut: 0, crits: 0 }), "beginTable resets per-table stats");
}

/* ---------- WON guard: table 8 clear shows won once; table 9 clear advances without re-showing it ---------- */
{
  clearMeta();
  Object.assign(G, { table: 8, hasWon: false, screen: 'cashout', turn: 90, coins: 50,
    tstats: { broken: 0, cut: 0, crits: 0 }, pendingCashout: null, blocks: [], jokers: [],
    particles: [], floats: [], coinfx: [], destroyedThisTurn: 0, stats: { broken: 0 },
    bossMod: null, bossMod2: null, bossKillsThisRun: 0, newUnlocksThisRun: [] });
  getElement('cashoutBtn').onclick();
  assert.equal(G.screen, 'won', "first Table-8 clear shows the WON screen");
  assert.equal(G.hasWon, true, "G.hasWon is set");

  Object.assign(G, { table: 9, screen: 'cashout' });
  getElement('cashoutBtn').onclick();
  assert.equal(G.screen, 'play', "a later Table-9 clear advances straight into play, not WON again");
  clearMeta();
}

/* ---------- pickOffer: locked jokers are never offered, cascade works from a legendary roll ---------- */
{
  clearMeta();
  Object.assign(G, { jokers: [] });
  const rollPairs = [
    [0.99, 0.0], [0.99, 0.99], [0.9, 0.5], [0.6, 0.5], [0.1, 0.5], [0.99, 0.3], [0.95, 0.7],
  ];
  for (const [a, b] of rollPairs) {
    const id = withRandomSeq([a, b], () => pickOffer());
    assert.ok(id, "pickOffer always returns a card id");
    assert.ok(!LOCKED_JOKERS.includes(id), `pickOffer must never return a locked joker (got ${id}) for rolls ${a},${b}`);
  }
  clearMeta();
}

/* ---------- unlock exactness: avalanche fires at exactly 500 lifetime breaks, not 499; unlock() is idempotent ---------- */
{
  clearMeta();
  Object.assign(G, { jokers: [], destroyedThisTurn: 0, stats: { broken: 0 }, coins: 0, particles: [], floats: [],
    coinfx: [], tstats: { broken: 0, cut: 0, crits: 0 }, bossMod: null, bossMod2: null, newUnlocksThisRun: [] });
  const mkBlock = () => ({ boss: false, dead: false, row: 0, hp: 0, reward: 1, dispRow: 0, col: 0, cw: 1, chh: 1, kind: 'hex' });
  for (let i = 0; i < 499; i++) breakBlock(mkBlock(), null);
  assert.ok(!loadMeta().unlocked.avalanche, "499 lifetime breaks: avalanche stays locked");
  breakBlock(mkBlock(), null); // 500th break
  assert.ok(loadMeta().unlocked.avalanche, "exactly 500 lifetime breaks unlocks avalanche");
  assert.equal(G.newUnlocksThisRun.filter(id => id === 'avalanche').length, 1, "avalanche is unlocked exactly once");
  breakBlock(mkBlock(), null); // 501st break: unlock() must stay idempotent
  assert.equal(G.newUnlocksThisRun.filter(id => id === 'avalanche').length, 1, "unlock() does not push duplicates once already unlocked");
  clearMeta();
}

/* ---------- storage round-trip via the memStore fallback (sandbox has no localStorage) ---------- */
{
  clearMeta();
  const fresh = loadMeta();
  const defaultShape = JSON.stringify({ v: 1, bestTable: 0, bestTurn: 0, bestCoins: 0,
    lifetime: { broken: 0, launches: 0, bossKills: 0 }, unlocked: {} });
  assert.equal(JSON.stringify(fresh), defaultShape, "clearMeta resets to defaults");

  checkAchievements({ table: 2 }); // unlocks 'twins', triggers a real saveMeta()
  const afterUnlock = loadMeta();
  assert.equal(afterUnlock.unlocked.twins, true, "saveMeta/loadMeta round-trip persists unlocked flags via memStore");

  storageSet(META_KEY, '{not valid json');
  assert.doesNotThrow(() => loadMeta(), "corrupt JSON in storage must not throw");
  const corrupt = loadMeta();
  assert.equal(JSON.stringify(corrupt), defaultShape, "corrupt JSON falls back to defaults");
  clearMeta();
}

/* ---------- tableName ---------- */
{
  assert.equal(tableName(1), 'Penny Slots');
  assert.equal(tableName(8), 'The House');
  assert.equal(tableName(10), 'Overtime 2');
}

console.log("game logic tests: ok");
