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
  const classes = new Set();
  const el = {
    children: [],
    _listeners: {},
    classList: { add(...xs) { xs.forEach(x=>classes.add(x)); }, remove(...xs) { xs.forEach(x=>classes.delete(x)); }, toggle(x,on) { if(on===undefined? !classes.has(x):on)classes.add(x);else classes.delete(x); }, contains(x){ return classes.has(x); } },
    style: { setProperty() {} },
    addEventListener(type,fn) { (this._listeners[type]||(this._listeners[type]=[])).push(fn); },
    dispatchEvent(event) { for(const fn of this._listeners[event.type]||[])fn(event); },
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
  clearTimeout,
  Math,
};
sandbox.globalThis = sandbox;

const instrumented = scriptMatch[1].replace(
  "resize(); renderHand(); requestAnimationFrame(loop);",
  "globalThis.__game={G,bossAlive,breakBlock,detachChip,sellValue,refreshShop,renderShop,reset,CARDS,count,ballCount,ballDmg,coinMult,wallHit,spawnRow,spawnBoss,endTurn,hitBlock,cardPrice,buildOffers,bossGeom,checkSupport,checkLoss,critChance,pierceChance,baseHpAt,newBlock,ballPackPrice,rerollPrice,openShop,update,fire,resize,bx,by,tableClearBonus,tableQuotaFor,beginTable,enterCashout,computeCashoutTally,loadMeta,saveMeta,clearMeta,isUnlocked,checkAchievements,LOCKED_JOKERS,tableName,pickOffer,storageGet,storageSet,META_KEY,LEGACY_META_KEY,advanceToNextTable,effectiveDifficultyRound,analyzeSupport,cachedSupportAnalysis,completeVolley,spawnBall,geometrySnapshot,aimWithinBoard,startVolley,settleVolley,openLastVolley,closeLastVolley,generateGoals,evaluateGoals,moveBall,syncDepth,ICON_GRIDS,PAL,iconURI,renderGoals,rawCount,openJokerTip,closeJokerTip,down,onDocPointerDownForTip};"
);
assert.notEqual(instrumented, scriptMatch[1], "game script test hook was installed");
vm.runInNewContext(instrumented, sandbox);

const {
  G, bossAlive, breakBlock, refreshShop, renderShop, reset,
  CARDS, count, ballCount, ballDmg, coinMult, wallHit,
  spawnRow, spawnBoss, endTurn, hitBlock, cardPrice, buildOffers, bossGeom, checkSupport, checkLoss,
  critChance, pierceChance, baseHpAt, newBlock, ballPackPrice, rerollPrice, openShop, update, fire, resize, bx, by,
  tableClearBonus, beginTable, enterCashout, computeCashoutTally, loadMeta, saveMeta, clearMeta,
  isUnlocked, checkAchievements, LOCKED_JOKERS, tableName, pickOffer, storageGet, storageSet, META_KEY, LEGACY_META_KEY, advanceToNextTable,
  effectiveDifficultyRound, analyzeSupport, cachedSupportAnalysis, completeVolley, spawnBall, geometrySnapshot, aimWithinBoard,
  tableQuotaFor, startVolley, settleVolley, openLastVolley, closeLastVolley, generateGoals, evaluateGoals, detachChip, moveBall, syncDepth,
  ICON_GRIDS, PAL, iconURI, renderGoals, rawCount, openJokerTip, closeJokerTip, down, onDocPointerDownForTip,
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
assert.equal(G.coins, 1, "armor-reduced damage must not create fake overkill Cash");
Object.assign(G, { coins: 0, particles: [], coinfx: [], floats: [], destroyedThisTurn: 0 });
breakBlock({ boss: false, col: 0, cw: 1, chh: 1, dispRow: 0, hp: 0, reward: 1, _hitDamage: 5, _hpBefore: 1 }, {});
assert.equal(G.coins, 5, "real excess damage still awards Overkill Cash");

Object.assign(G, { coins: 0, jokers: ["heavy", "rapid", "midas", "interest", "combo"], shopVisits: 1, rerollCost: 3, offers: [] });
refreshShop();
const displayedSellValue = Number(getElement("ownedRow").children[0].innerHTML.match(/\+\$(\d+)/)[1]);
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
  assert.equal(G.coins, 1, "the same destroyed chip can only pay Cash once");
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
  assert.equal(G.coins, 2, "a splash-killed chip in a falling cluster cannot pay Cash twice");
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
  Object.assign(G, { table: 3, bossOvertime: true, blocks: [] });
  withRandomSeq(noGapPattern(7), () => spawnRow());
  assert.equal(G.blocks.length, 7, "the seven-column board creates one chip per column");
  for (const b of G.blocks) {
    assert.equal(b.type, "chip");
    assert.equal(b.cw, 1);
    assert.equal(b.hp, 37, "baseHpAt(36)=37, mid roll (0.5) -> round(37*1.0)=37");
  }
}

/* ---------- spawnRow gap floor respected ---------- */
{
  Object.assign(G, { table: 9, bossOvertime: true, blocks: [] });
  withRandomSeq([0.049, ...noGapPattern(6)], () => spawnRow());
  assert.equal(G.blocks[0].col, 1, "gap floor of 0.05 still lets a sub-floor roll skip column 0");
}

/* ---------- spawnBoss at table 2 ---------- */
{
  Object.assign(G, { table: 2, bossOvertime: true, blocks: [] });
  withRandomSeq([0.3], () => spawnBoss());
  const boss = G.blocks.find(b => b.boss);
  assert.equal(boss.hp, 165, "boss 2 hp = round(baseHpAt(24)*7.5) = round(22*7.5)");
  assert.equal(G.bossMod, "scissors", "boss rules follow the visible four-table cycle");
  assert.equal(boss.armor, 2, "armor = 1+ceil(table/2)");
  assert.equal(boss.gcol, 0, "placement roll 0.3*3=0.9 floors to gcol 0");
  assert.equal(boss.gcols, 5, "boss always spans BOSS_GCOLS=5 columns");
  syncDepth();
  assert.equal(getElement('depthLine').textContent, 'THE SCISSORS', "boss depth label drops the 'BOSS · ' prefix so it doesn't overlap the score stat");
}

/* ---------- boss pressure rows during boss fights ---------- */
{
  Object.assign(G, { table: 2, roundInTable: 6, bossOvertime: true, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  const before = G.blocks.length;
  withRandomSeq(noGapPattern(7), () => endTurn());
  assert.equal(G.blocks.length, before, "the first failed boss volley has no pressure row");
  withRandomSeq(noGapPattern(7), () => endTurn());
  assert.ok(G.blocks.length > before, "every second failed boss volley adds a pressure row");
}
{
  Object.assign(G, { table: 2, roundInTable: 6, bossOvertime: true, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  const before = G.blocks.length;
  endTurn(); endTurn();
  assert.ok(G.totalVolleys > 0, "boss overtime still records completed volleys");
  assert.ok(G.blocks.length > before, "boss overtime pressure arrives on its second failed volley");
}

/* ---------- Skeleton Key reduces effective boss armor ---------- */
{
  Object.assign(G, { destroyedThisTurn: 0, floats: [], coinfx: [], particles: [] });
  startVolley();
  const b1 = { boss: true, dead: false, hp: 100, maxhp: 100, armor: 5, row: 0, rowSpan: 2, dispRow: 0 };
  const g1 = bossGeom(b1);
  const ball1 = { x: g1.cx, y: g1.cy, vx: 1, vy: 1, r: 5, dmg: 10 };
  Object.assign(G, { jokers: [] });
  hitBlock(ball1, b1);
  assert.equal(b1.hp, 95, "no skeleton key: eff dmg = max(1, 10-5) = 5");
  assert.equal(G.volley.bossDamageScore,5,'boss Score uses actual HP removed after armor');

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
  Object.assign(G, { jokers: ["snowball"], stats: { broken: 19 } });
  assert.equal(ballDmg(), 1, "19 broken: below the 20-chip threshold, no bonus yet");
  Object.assign(G, { stats: { broken: 20 } });
  assert.equal(ballDmg(), 2, "20 broken: +1 ball dmg kicks in");
  Object.assign(G, { stats: { broken: 80 } });
  assert.equal(ballDmg(), 5, "80 broken: +4 ball dmg (four thresholds crossed)");
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
  assert.equal(G.coins, 2, "detached chips retain their normal Cash payout");
  assert.equal(G.particles.length, 1, "a faller particle is spawned");
  assert.equal(G.particles[0].kind, "faller");
  assert.equal(G.particles[0].smashDmg, 1, "smashDmg = max(1, round(hp*0.25)) snapshotted at detach");
  assert.equal(G.particles[0].smashed.length, 0, "a fresh faller has smashed nothing yet");
}

/* ---------- faller smash: a falling chip damages what it passes through, once each ---------- */
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 }, screen: 'shop', _died: false,
    blocks: [
      { id: 'nonlethal', type: 'chip', boss: false, dead: false, row: 5, col: 2, cw: 1, chh: 1, dispRow: 5, hp: 10, maxhp: 10, reward: 1, kind: 'square', squash: 0, flash: 0 },
    ] });
  const target = G.blocks[0], tx = bx(target), ty = by(target);
  const p = { kind: 'faller', x: tx, y: ty, vy: 0, vr: 0, delay: 0, rot: 0, sKind: 'square', cw: 1, chh: 1, hp: 8, life: 1, smashDmg: 2, smashed: [] };
  G.particles = [p];
  update(0.001);
  assert.equal(target.hp, 8, "a faller deals smashDmg to a chip whose band it passes through");
  assert.deepEqual(p.smashed, ['nonlethal'], "the smashed chip's id is recorded on the faller");
  update(0.001);
  assert.equal(target.hp, 8, "a second pass over the same chip does not re-hit it");
  assert.equal(p.smashed.length, 1, "smashed ids are not duplicated on repeat passes");
}
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 }, screen: 'shop', _died: false,
    blocks: [
      { id: 'lethal', type: 'chip', boss: false, dead: false, row: 5, col: 2, cw: 1, chh: 1, dispRow: 5, hp: 2, maxhp: 2, reward: 3, kind: 'square', squash: 0, flash: 0 },
    ] });
  const target = G.blocks[0], tx = bx(target), ty = by(target);
  G.particles = [{ kind: 'faller', x: tx, y: ty, vy: 0, vr: 0, delay: 0, rot: 0, sKind: 'square', cw: 1, chh: 1, hp: 8, life: 1, smashDmg: 2, smashed: [] }];
  update(0.001);
  assert.equal(target.dead, true, "a lethal smash kills the chip via the normal breakBlock path");
  assert.equal(G.coins, 3, "the smashed kill pays its normal Cash reward through breakBlock");
  assert.equal(G.stats.broken, 1, "a fall-smashed kill counts as a normal break in stats");
}
{
  // smash cap: a single faller smashes at most 4 chips
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 }, screen: 'shop', _died: false });
  const chips = [];
  for (let r = 0; r < 5; r++) chips.push({ id: 'cap' + r, type: 'chip', boss: false, dead: false, row: r, col: 2, cw: 1, chh: 1, dispRow: r, hp: 100, maxhp: 100, reward: 1, kind: 'square', squash: 0, flash: 0 });
  G.blocks = chips;
  const p = { kind: 'faller', x: 0, y: 0, vy: 0, vr: 0, delay: 0, rot: 0, sKind: 'square', cw: 1, chh: 1, hp: 8, life: 1, smashDmg: 1, smashed: [] };
  G.particles = [p];
  for (let i = 0; i < 5; i++) { p.x = bx(chips[i]); p.y = by(chips[i]); update(0); }
  assert.equal(p.smashed.length, 4, "a single faller smashes at most 4 chips");
  assert.equal(chips[4].hp, 100, "the 5th chip in range is untouched once the smash cap is hit");
}
{
  // boss armor applies to fall-smash damage, plain max(1, smashDmg-armor)
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [], destroyedThisTurn: 0, stats: { broken: 0 },
    screen: 'shop', _died: false, bossMod: null, bossMod2: null, bossKillsThisRun: 0, newUnlocksThisRun: [] });
  const boss = { id: 'bossf', type: 'chip', boss: true, dead: false, row: 3, rowSpan: 2, dispRow: 3, col: 1, gcol: 1, gcols: 3, hp: 20, maxhp: 20, armor: 3, reward: 4 };
  G.blocks = [boss];
  const g = bossGeom(boss);
  G.particles = [{ kind: 'faller', x: g.cx, y: g.cy, vy: 0, vr: 0, delay: 0, rot: 0, sKind: 'square', cw: 1, chh: 1, hp: 8, life: 1, smashDmg: 5, smashed: [] }];
  update(0);
  assert.equal(boss.hp, 18, "boss smash damage = max(1, smashDmg-armor) = max(1,5-3) = 2");
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
  const spots = { 1: 1, 2: 2, 3: 2, 4: 3, 17: 15, 40: 43 };
  for (const [t, expected] of Object.entries(spots)) {
    assert.equal(baseHpAt(Number(t)), expected, `baseHpAt(${t}) === ${expected}`);
  }
}

/* ---------- boss hp = round(baseHpAt(12*num)*7.5) across multiple tables ---------- */
{
  Object.assign(G, { table: 1, bossOvertime: true, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.blocks.find(b => b.boss).hp, 75, "boss 1 hp = round(baseHpAt(12)*7.5) = round(10*7.5)");
}
{
  Object.assign(G, { table: 4, bossOvertime: true, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.blocks.find(b => b.boss).hp, 405, "boss 4 hp = round(baseHpAt(48)*7.5) = 54*7.5");
}

/* ---------- boss gap placement: deterministic roll -> gcol, always 5 columns wide ---------- */
{
  Object.assign(G, { table: 1, bossOvertime: true, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  let boss = G.blocks.find(b => b.boss);
  assert.equal(boss.gcol, 0, "roll 0.1*3=0.3 floors to gcol 0 (left-flush)");
  assert.equal(boss.gcols, 5, "boss always spans 5 columns");

  Object.assign(G, { table: 1, bossOvertime: true, blocks: [] });
  withRandomSeq([0.4], () => spawnBoss());
  boss = G.blocks.find(b => b.boss);
  assert.equal(boss.gcol, 1, "roll 0.4*3=1.2 floors to gcol 1 (centered)");

  Object.assign(G, { table: 1, bossOvertime: true, blocks: [] });
  withRandomSeq([0.7], () => spawnBoss());
  boss = G.blocks.find(b => b.boss);
  assert.equal(boss.gcol, 2, "roll 0.7*3=2.1 floors to gcol 2 (right-flush)");
}

/* ---------- boss gap width: each gap fits at least 3 ball diameters ---------- */
{
  Object.assign(G, { table: 1, bossOvertime: true, blocks: [] });
  withRandomSeq([0.4], () => spawnBoss());
  const boss = G.blocks.find(b => b.boss), snap = geometrySnapshot();
  const gapCols = snap.cols - boss.gcols;
  assert.ok(gapCols * snap.cellW >= 3 * (2 * snap.ballR), "total gap width across the board fits at least 3 ball diameters");
}

/* ---------- anchor-overlap: boss anchors only column-overlapping chips in adjacent rows ---------- */
{
  Object.assign(G, { coins: 0, jokers: [], particles: [], floats: [], coinfx: [],
    destroyedThisTurn: 0, stats: { broken: 0 },
    blocks: [
      { boss: true, dead: false, row: 3, rowSpan: 2, hp: 50, armor: 1, dispRow: 3, gcol: 1, gcols: 5 },
      { col: 1, row: 2, cw: 5, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
      { col: 0, row: 5, cw: 1, chh: 1, type: 'chip', boss: false, dead: false, hp: 3, reward: 2, rot: 0 },
    ] });
  const detached = checkSupport();
  assert.equal(detached, true, "the gap-column chip with no other chain detaches");
  assert.equal(G.blocks[1].dead, false, "the chip overlapping the boss's real column span (row 2, col 1..6) stays anchored");
  assert.equal(G.blocks[2].dead, true, "the chip in the boss's gap column (row 5, col 0, outside gcol 1..5) is not anchored by the boss");
}

/* ---------- bossGeom: legacy fallback reproduces full-width geometry with no gcol/gcols ---------- */
{
  const boss = { boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 };
  const g = bossGeom(boss), snap = geometrySnapshot();
  assert.equal(g.hw, snap.boardSize * 0.47, "legacy fallback: half-width equals boardSize*0.47");
  assert.equal(g.cx, snap.boardLeft + snap.boardSize / 2, "legacy fallback: center is the board center");
}

/* ---------- Bank Shot: ceiling hits never trigger the bonus ---------- */
{
  Object.assign(G, { jokers: ["bank"] });
  const ball = { dmg: 1, _bank: 0, x: 0, y: 0 };
  for (let i = 0; i < 10; i++) wallHit(ball, true);
  assert.equal(ball.dmg, 1, "10 ceiling-only hits add 0 bank-shot damage");
}
{
  startVolley(); Object.assign(G,{jokers:[]});
  const ball={dmg:1,_skipWall:true,x:0,y:0}; wallHit(ball,false);
  assert.equal(ball._sideBounces,1,'raw side bounces are tracked even when wall bonuses are skipped');
  assert.equal(G.volley.sideBounces,1,'the volley event ledger records raw side bounces');
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
  assert.equal(G.coins, 50, "interest payout is doubled for the six-volley cadence");
}
{
  Object.assign(G, { turn: 5, coins: 100, jokers: ["interest"], shopVisits: 0, floats: [], coinfx: [],
    blocks: [], jstate: {}, stats: { broken: 0 }, bossMod: null });
  endTurn();
  assert.equal(G.coins, 116, "interest cap is doubled for the six-volley cadence");
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
  assert.equal(G.coins, 6, "cascade removals retain their normal Cash payouts");
  assert.equal(G.particles.filter(p => p.kind === "faller").length, 3, "3 faller particles spawned");
}

/* ---------- roster integrity: unique ids/names, every id referenced in a hook ---------- */
{
  const seenNames = new Set();
  for (const id of cardIds) {
    const c = CARDS[id];
    assert.ok(!seenNames.has(c.nm), `duplicate joker name: ${c.nm}`);
    seenNames.add(c.nm);
    assert.ok(c.ic && typeof c.ic === "string" && c.ic.length > 0, `${id} has an emoji fallback icon`);
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

/* ---------- ICON_GRIDS integrity: every joker + UI icon name present, 12x12, legal chars, unique ---------- */
{
  const UI_ICON_NAMES = ["goal_target", "goal_sweep", "goal_pinball", "goal_cut", "goal_bank", "goal_hit",
    "skull", "spade", "ballpack", "mute_on", "mute_off", "pickup"];
  const legalChars = new Set("kcgdrRAbsPpweu.".split(""));
  const seenGrids = new Map();
  for (const id of [...cardIds, ...UI_ICON_NAMES]) {
    const grid = ICON_GRIDS[id];
    assert.ok(Array.isArray(grid), `ICON_GRIDS has an entry for "${id}"`);
    assert.equal(grid.length, 12, `"${id}" icon grid has 12 rows`);
    for (const row of grid) {
      assert.equal(row.length, 12, `"${id}" icon grid row has 12 columns`);
      for (const ch of row) assert.ok(legalChars.has(ch), `"${id}" icon grid uses only legal PAL characters (got "${ch}")`);
    }
    const sig = JSON.stringify(grid);
    assert.ok(!seenGrids.has(sig), `icon grid for "${id}" duplicates the grid for "${seenGrids.get(sig)}"`);
    seenGrids.set(sig, id);
  }
  assert.ok(PAL && typeof PAL === "object" && PAL.k, "PAL palette is exported and has an ink color");
}

/* ---------- iconURI: guarded, returns null (never throws) in the sandbox ---------- */
{
  assert.doesNotThrow(() => iconURI("heavy", 36, "#d64550"), "iconURI never throws even without a real canvas");
  assert.equal(iconURI("heavy", 36, "#d64550"), null, "iconURI returns null in the mocked DOM sandbox");
  assert.equal(iconURI("nonexistent_icon_name", 24), null, "iconURI returns null for an unknown icon name");
}

/* ---------- renderHand/renderShop/renderGoals still run clean with icon fallback ---------- */
{
  Object.assign(G, { jokers: ["heavy", "rapid"], coins: 50, offers: [], shopVisits: 0, jstate: {}, activeGoals: [] });
  assert.doesNotThrow(() => reset(), "reset() (which calls renderHand()) runs clean with the icon system installed");
  assert.doesNotThrow(() => renderShop(), "renderShop() runs clean with the icon system installed");
  assert.doesNotThrow(() => renderGoals(), "renderGoals() runs clean with the icon system installed");
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
  Object.assign(G, { table: 2, roundInTable: 6, bossOvertime: true, jokers: [], coins: 0, shopVisits: 0, floats: [], coinfx: [],
    blocks: [{ boss: true, dead: false, row: 0, rowSpan: 2, hp: 50, armor: 1, dispRow: 0 }] });
  endTurn();
  assert.ok(G.totalVolleys > 0, "endTurn records the completed volley");
  const bosses = G.blocks.filter(b => b.boss);
  assert.equal(bosses.length, 1, "a surviving boss at the turn-24 boundary must not spawn a second boss");
}

/* ---------- boss rules cycle predictably and never stack hidden modifiers ---------- */
{
  Object.assign(G, { table: 5, bossOvertime: true, blocks: [] });
  withRandomSeq([0.3, 0.1], () => spawnBoss());
  assert.equal(G.bossMod,'vault','table 5 cycles back to The Vault');
  assert.equal(G.bossMod2,null,'bosses expose one readable rule at a time');
  assert.equal(G.blocks.find(b=>b.boss).sealed,true,'The Vault starts sealed');
  assert.equal(G.blocks.find(b=>b.boss).gcol,0,'placement roll 0.3*3=0.9 floors to gcol 0');
}
{
  Object.assign(G, { table: 4, bossOvertime: true, blocks: [] });
  withRandomSeq([0.1], () => spawnBoss());
  assert.equal(G.bossMod,'splitpot','table 4 previews and spawns Split Pot');
  assert.equal(G.bossMod2, null, "legacy hidden second modifiers stay removed");
  assert.equal(G.blocks.find(b=>b.boss).gcol,0,'placement roll 0.1*3=0.3 floors to gcol 0');
}

assert.ok(Object.values(CARDS).every(c=>Array.isArray(c.tags)&&c.tags.length),'all 89 jokers carry at least one archetype tag');

/* ---------- active boss rules change damage in readable, deterministic ways ---------- */
{
  Object.assign(G,{screen:'play',jokers:[],blocks:[],particles:[],floats:[],coinfx:[],activeGoals:[],destroyedThisTurn:0,hitStop:0});
  const boss={id:'vault-boss',boss:true,dead:false,hp:100,maxhp:100,armor:0,row:0,rowSpan:2,dispRow:0,sealed:true}; G.blocks=[boss]; G.bossMod='vault'; startVolley();
  const g=bossGeom(boss); hitBlock({x:g.cx,y:g.cy,vx:0,vy:10,r:8,dmg:10,_sideBounces:0,idx:0},boss);
  assert.equal(boss.hp,99,'The Vault caps unbanked damage at 1');
  hitBlock({x:g.cx,y:g.cy,vx:0,vy:10,r:8,dmg:10,_sideBounces:2,idx:1},boss);
  assert.equal(boss.hp,89,'two side bounces crack The Vault seal before damage');
  assert.equal(boss.sealed,false);
}
{
  const boss={id:'call-boss',boss:true,dead:false,hp:100,maxhp:100,armor:0,row:0,rowSpan:2,dispRow:0}; Object.assign(G,{bossMod:'lastcall',blocks:[boss],jokers:[],hitStop:0}); startVolley();
  const g=bossGeom(boss); hitBlock({x:g.cx,y:g.cy,vx:0,vy:10,r:8,dmg:4,anchor:true,idx:3},boss);
  assert.equal(boss.hp,88,'Last Call triples the final ball damage');
}

/* ---------- hit-stop freezes simulation and adaptive speed removes dead air ---------- */
{
  Object.assign(G,{screen:'play',blocks:[],balls:[{x:10,y:10,vx:100,vy:100,r:3}],queue:[],particles:[],floats:[],coinfx:[],hitStop:.02,timeScale:1,manualSpeed:false,flightIdle:0});
  update(.01); assert.equal(G.balls[0].x,10,'hit-stop does not re-run collision or movement at zero delta');
  Object.assign(G,{balls:[],queue:[1],fireTimer:99,hitStop:0,flightIdle:0,timeScale:1,manualSpeed:false});
  update(.91); assert.equal(G.timeScale,1.75,'flight accelerates after 0.9 seconds without a productive hit');
  update(.9); assert.equal(G.timeScale,3,'flight accelerates again after 1.8 seconds of dead air');
  G.queue=[]; G.screen='start';
}

/* ---------- cash-out: boss kill is gated by the score quota ---------- */
{
  clearMeta();
  Object.assign(G, { table: 3, tstats: { broken: 5, cut: 2, crits: 1 }, pendingCashout: null, coins: 0,
    jokers: [], particles: [], floats: [], coinfx: [], destroyedThisTurn: 0, stats: { broken: 0 },
    bossKillsThisRun: 0, bossMod: null, bossMod2: null, blocks: [], newUnlocksThisRun: [] });
  const boss = { boss: true, dead: false, hp: 0, maxhp: 100, reward: 20, row: 0, rowSpan: 2, dispRow: 0, col: 0, cw: 1, chh: 1 };
  breakBlock(boss, null);
  assert.equal(G.bossKilled, true, "boss death starts collection-overtime gating");
  assert.ok(G.pendingCashout, "boss Cash bonus is preserved through collection overtime");
  const tally = computeCashoutTally();
  assert.equal(tally.broken, G.tstats.broken);
  assert.equal(tally.cut, G.tstats.cut);
  assert.equal(tally.crits, G.tstats.crits);
  assert.equal(tally.bossBonus, 20);
  assert.equal(tally.clearBonus, tableClearBonus(G.table), "computeCashoutTally's clearBonus matches tableClearBonus(G.table)");
  clearMeta();
}

/* ---------- enterCashout: consumes pendingCashout without double-counting the volley ---------- */
{
  Object.assign(G, { table: 2, turn: 9, tstats: { broken: 3, cut: 1, crits: 0 }, pendingCashout: { bossBonus: 15 },
    coins: 100, screen: 'play', coinfx: [] });
  enterCashout();
  assert.equal(G.turn, 9, "enterCashout does not increment an already-completed volley");
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
  assert.equal(G.screen, 'shop', "a later Table-9 clear opens the post-boss shop, not WON again");
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
  const defaultShape = JSON.stringify({ v: 2, bestTable: 0, bestTurn: 0, bestCoins: 0,
    lifetime: { broken: 0, launches: 0, bossKills: 0 }, unlocked: {} });
  assert.equal(JSON.stringify(fresh), defaultShape, "clearMeta resets to defaults");

  checkAchievements({ table: 2 }); // unlocks 'twins', triggers a real saveMeta()
  const afterUnlock = loadMeta();
  assert.equal(afterUnlock.unlocked.twins, true, "saveMeta/loadMeta round-trip persists unlocked flags via memStore");

  storageSet(META_KEY, '{not valid json');
  assert.doesNotThrow(() => loadMeta(), "corrupt JSON in storage must not throw");
  const corrupt = loadMeta();
  assert.equal(JSON.stringify(corrupt), defaultShape, "corrupt JSON falls back to defaults");

  storageSet(META_KEY, '');
  storageSet(LEGACY_META_KEY, JSON.stringify({ v: 1, bestTable: 3, bestTurn: 17, bestCoins: 44,
    lifetime: { broken: 8, launches: 9, bossKills: 1 }, unlocked: { twins: true } }));
  const migrated = loadMeta();
  assert.equal(migrated.v, 2, "v1 meta migrates to v2");
  assert.equal(migrated.bestTurn, 9, "v1 bestTurn is converted with ceil(old/2)");
  assert.equal(JSON.parse(storageGet(META_KEY)).bestTurn, 9, "the migrated v2 record is saved durably");
  clearMeta();
}

/* ---------- tableName ---------- */
{
  assert.equal(tableName(1), 'Penny Slots');
  assert.equal(tableName(8), 'The House');
  assert.equal(tableName(10), 'Overtime 2');
}

/* ---------- Phase 1 board, cadence, stable ids, and cached support analysis ---------- */
{
  reset();
  let geometry = geometrySnapshot();
  assert.equal(geometry.cols, 7, "the board retains seven columns");
  assert.equal(geometry.safeRows, 10, "the board exposes ten safe rows");
  assert.equal(bx(newBlock(3, 0, 1, 'chip', 1, 1)), 175, "column 3 remains the centered joker column");
  assert.equal(aimWithinBoard(geometry.boardLeft + geometry.ballR, geometry.ballR), true, "normal aim accepts the left board edge");
  assert.equal(aimWithinBoard(geometry.boardLeft + geometry.ballR - 0.01, geometry.ballR), false, "normal aim rejects canvas gutter space");

  Object.assign(G, { screen: 'play', blocks: [{ boss: false, type: 'chip', dead: false, row: 9 }] });
  assert.equal(checkLoss(), false, "normal row 9 is safe");
  Object.assign(G, { screen: 'play', blocks: [{ boss: false, type: 'chip', dead: false, row: 10 }] });
  assert.equal(checkLoss(), true, "normal row 10 loses");
  Object.assign(G, { screen: 'play', blocks: [{ boss: true, type: 'chip', dead: false, row: 8, rowSpan: 2 }] });
  assert.equal(checkLoss(), false, "a two-row boss whose bottom is row 9 is safe");
  Object.assign(G, { screen: 'play', blocks: [{ boss: true, type: 'chip', dead: false, row: 9, rowSpan: 2 }] });
  assert.equal(checkLoss(), true, "a two-row boss whose bottom reaches row 10 loses");

  reset(); geometry = geometrySnapshot();
  G.launchX=geometry.boardLeft+geometry.boardSize*0.25; G.firstReturnX=geometry.boardLeft+geometry.boardSize*0.75;
  G.balls=[{x:G.launchX,y:geometry.launchY-geometry.cellW,vx:geometry.speed*0.6,vy:-geometry.speed*0.8,r:geometry.ballR}];
  G.particles=[{x:geometry.boardLeft+geometry.boardSize*0.4,y:geometry.cellW*2,vx:10,vy:-20,r:2,w:3,h:4,rad:5,maxr:6}];
  G.floats=[{x:geometry.boardLeft+geometry.boardSize*0.6,y:geometry.cellW*3,size:10}];
  G.coinfx=[{x:geometry.boardLeft+geometry.boardSize*0.7,y:geometry.cellW*4}];
  const oldRadius=G.balls[0].r;
  stage.clientWidth=500; stage.clientHeight=300; resize();
  const resized=geometrySnapshot(), live=G.balls[0], scale=resized.boardSize/geometry.boardSize;
  assert.ok(Math.abs(G.launchX-(resized.boardLeft+resized.boardSize*0.25))<1e-9, "resize remaps the launcher within centered board bounds");
  assert.ok(Math.abs(G.firstReturnX-(resized.boardLeft+resized.boardSize*0.75))<1e-9, "resize remaps the pending return point");
  assert.ok(Math.abs(Math.hypot(live.vx,live.vy)-resized.speed)<1e-9, "resize remaps active ball velocity to the new speed");
  assert.ok(live.r<oldRadius, "resize remaps the active ball radius");
  assert.ok(Math.abs(G.particles[0].vx-10*scale)<1e-9&&Math.abs(G.particles[0].vy+20*scale)<1e-9,"resize remaps particle velocity");
  for(const [key,value] of Object.entries({r:2,w:3,h:4,rad:5,maxr:6}))assert.ok(Math.abs(G.particles[0][key]-value*scale)<1e-9,`resize remaps particle ${key}`);
  assert.ok(Math.abs(G.particles[0].x-(resized.boardLeft+resized.boardSize*0.4))<1e-9,"resize remaps particle position");
  assert.ok(Math.abs(G.floats[0].size-10*scale)<1e-9,"resize remaps explicit float size");
  assert.ok(Math.abs(G.coinfx[0].x-(resized.boardLeft+resized.boardSize*0.7))<1e-9,"resize remaps coin effect position");
  Object.assign(G,{balls:[],dir:{x:0,y:-1},ballIdx:0,jokers:[],stats:{broken:0},jstate:{}}); spawnBall(false);
  assert.ok(Math.abs(Math.hypot(G.balls[0].vx,G.balls[0].vy)-0.55*resized.speed)<1e-9,"queued balls launch at 0.55x the resized speed (Holedown ramp-up)");
  stage.clientWidth=350; stage.clientHeight=600; G.balls=[]; resize();

  assert.equal(effectiveDifficultyRound(), 1, "Table 1 starts at the legacy difficulty floor");
  Object.assign(G, { table: 2, roundInTable: 3, bossOvertime: false });
  assert.equal(effectiveDifficultyRound(), 17, "six-round tables preserve the old twelve-step difficulty bands");
  const a = newBlock(0, 0, 1, 'chip', 1, 1), b = newBlock(0, 1, 1, 'chip', 1, 1), c = newBlock(4, 1, 1, 'chip', 1, 1);
  assert.notEqual(a.id, b.id, "new blocks receive stable unique ids");
  const analysis = analyzeSupport([a, b, c]);
  assert.deepEqual(Array.from(analysis.anchoredIds).sort(), [a.id, b.id].sort(), "support analysis finds connected anchored blocks without mutating them");
  assert.deepEqual(Array.from(analysis.unsupportedIds), [c.id], "support analysis identifies unsupported blocks for later cascade work");
  const supportBlocks=[a,b,c], cached=cachedSupportAnalysis(supportBlocks);
  assert.strictEqual(cachedSupportAnalysis(supportBlocks),cached,"unchanged support analysis is returned from cache");
  assert.deepEqual(Array.from(cached.adjacency[a.id]),[b.id],"support analysis exposes useful adjacency");
  c.col=0;
  const invalidated=cachedSupportAnalysis(supportBlocks);
  assert.notStrictEqual(invalidated,cached,"support cache invalidates when block geometry changes");
  assert.equal(invalidated.unsupportedIds.length,0,"invalidated support analysis reflects the mutation");
}

/* ---------- Holedown launch-acceleration ramp (Part 2b) ---------- */
{
  const geometry=geometrySnapshot(), savedBlocks=G.blocks;
  G.blocks=[];
  const ball={x:geometry.boardLeft+geometry.boardSize/2,y:geometry.launchY-geometry.cellW*3,vx:0.55*geometry.speed,vy:0,r:geometry.ballR,dmg:1,age:0,sq:0,idx:0};
  moveBall(ball,0.1);
  const s1=Math.hypot(ball.vx,ball.vy);
  assert.ok(s1>0.55*geometry.speed-1e-9 && s1<geometry.speed+1e-9,"ramp increases speed toward full SPEED without exceeding it");
  moveBall(ball,0.1);
  const s2=Math.hypot(ball.vx,ball.vy);
  assert.ok(s2>=s1-1e-9,"ramp speed keeps increasing (or holds) as age approaches 0.35s");
  moveBall(ball,0.29);
  const s3=Math.hypot(ball.vx,ball.vy);
  assert.ok(Math.abs(s3-geometry.speed)<1e-6,"once age passes 0.35s (still under the 0.5s rescale window) speed reaches full SPEED");
  G.blocks=savedBlocks;
}

{
  reset();
  Object.assign(G,{screen:'play',roundInTable:2,totalVolleys:1,turn:2,blocks:[],jokers:[],coins:0,shopVisits:0,floats:[],coinfx:[]});
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.totalVolleys,2,"round 2 completion counts one volley");
  assert.equal(G.roundInTable,3,"round 2 advances to round 3");
  assert.equal(G.screen,'shop',"the shop opens after round 2 only after board resolution");
  assert.equal(getElement('depthLine').textContent,'3/6',"the HUD resolves before the round-2 shop opens");
  Object.assign(G,{screen:'play',roundInTable:3});
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.screen,'play',"round 3 does not open a shop");
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.screen,'shop',"the shop opens after round 4");

  Object.assign(G,{screen:'play',roundInTable:6,totalVolleys:5,turn:6,bossOvertime:false,blocks:[newBlock(0,1,1,'chip',1,1)],jokers:[],coins:0,floats:[],coinfx:[]});
  const priorRow=G.blocks[0].row;
  withRandomSeq([0.1],()=>endTurn());
  assert.equal(G.blocks[0].row,priorRow+1,"transition into the boss round descends existing blocks once");
  assert.equal(G.bossOvertime,true,"round 6 transitions into boss overtime");
  assert.equal(G.blocks.filter(block=>block.boss).length,1,"round 6 spawns exactly one boss");

  const doomed=[]; for(let row=0;row<10;row++)doomed.push(newBlock(0,row,1,'chip',1,1));
  Object.assign(G,{screen:'play',roundInTable:2,totalVolleys:1,turn:2,bossOvertime:false,blocks:doomed});
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.screen,'over',"loss resolution takes precedence over opening a scheduled shop");
}
{
  reset();
  Object.assign(G,{screen:'play',phase:'flight',totalVolleys:6,turn:7,bossKilled:true,tableScore:0,tableQuota:999,blocks:[],balls:[{x:175,y:999,vx:0,vy:0,r:5,_collected:true}],queue:[],firstReturnX:175,coins:0,coinfx:[],volley:{id:1,events:[],breakScore:0,cascadeScore:0,bossDamageScore:0,completedGoals:[],cashBounty:0,settled:false}});
  update(0.016);
  assert.equal(G.totalVolleys,7,"a settled volley advances immediately, without waiting on a blocking receipt");
  assert.equal(G.phase,'aim',"even a zero-score volley resolves straight back to aiming");
}

/* ---------- Phase 2: score ledger, goals, receipts, collection overtime ---------- */
{
  assert.deepEqual([1,2,3,4,5,6,7,8].map(tableQuotaFor), [375,1125,2250,3750,5250,7000,9000,10750]);
  assert.equal(tableQuotaFor(9), Math.round(10750*1.35), "overtime quota scales from table 8");
  reset();
  assert.equal(G.activeGoals.length, 3, "every board starts with exactly three goals");
  assert.equal(JSON.stringify(G.activeGoals.map(g=>[g.tier,g.bonus,g.cash])), JSON.stringify([['easy',.25,1],['medium',.5,2],['hard',.75,3]]));
}
{
  const block={id:'target',boss:false}, other={id:'other',boss:false};
  function verify(id,config,setup,type,target,ball){
    startVolley(); G.activeGoals=[Object.assign({tier:'test',id,label:id,bonus:.25,cash:1,done:false},config||{})];
    setup(G.volley); evaluateGoals(type,target||block,ball||null);
    assert.equal(G.activeGoals[0].done,true,id+' completes on its qualifying event');
  }
  verify('break2',{need:2},v=>{v.breaks=2;},'break',block,{});
  verify('pinball',{need:8},v=>{v.impacts=8;},'impact',block,{});
  startVolley(); G.activeGoals=[{tier:'easy',id:'danger',label:'danger',bonus:.25,cash:1,done:false,targetIds:['target']}]; G.volley.impacts=1;
  evaluateGoals('impact',block,{}); assert.equal(G.activeGoals[0].done,false,'danger does not complete merely on hit');
  evaluateGoals('break',block,{}); assert.equal(G.activeGoals[0].done,true,'danger completes when its snapshot target is removed');
  verify('bank',{need:1},()=>{},'break',block,{_sideBounces:1});
  verify('cut2',{need:2},v=>{v.cuts=2;},'cut',block);
  verify('sweep',{targetIds:['target','other']},v=>{v.events=[{type:'break',id:'target'},{type:'cut',id:'other'}];},'cut',other);
  verify('doublebank',{need:2},()=>{},'break',block,{_sideBounces:2});
  verify('cut4',{need:4},v=>{v.cuts=4;},'cut',block);
  verify('target',{targetIds:['target'],limit:5},v=>{v.impacts=5;},'impact',block,{});
}
{
  G.blocks=[]; generateGoals();
  assert.equal(G.activeGoals.length,0,'an impossible empty board never deals impossible goals');
  withRandomSeq(Array(30).fill(0),()=>spawnRow());
  assert.ok(G.blocks.some(b=>b.type==='chip'&&!b.dead),'row generation always leaves at least one playable chip');
  startVolley(); G.activeGoals=[{id:'target',label:'target',bonus:.75,cash:3,done:false,targetIds:['late'],limit:5}]; G.volley.impacts=6;
  evaluateGoals('impact',{id:'late'},{}); assert.equal(G.activeGoals[0].done,false,'marked target must be hit within the first five impacts');
}
{
  Object.assign(G,{coins:7,jokers:[],tableScore:0,runScore:0,activeGoals:[],particles:[],floats:[],coinfx:[],destroyedThisTurn:0,stats:{broken:0},tstats:{broken:0,cut:0,crits:0}});
  startVolley();
  const chip={id:'score-chip',boss:false,dead:false,col:0,row:0,cw:1,chh:1,dispRow:0,hp:0,maxhp:9,reward:4,kind:'square'};
  breakBlock(chip,null); breakBlock(chip,null);
  assert.equal(G.volley.breakScore,9,"a direct chip contributes starting HP exactly once");
  assert.equal(G.coins,11,"Cash payout remains independent from the score ledger");
  settleVolley(); settleVolley();
  assert.equal(G.tableScore,9,"volley settlement is idempotent");
}
{
  Object.assign(G,{coins:0,jokers:['midas'],tableScore:0,runScore:0,activeGoals:[],particles:[],floats:[],coinfx:[],destroyedThisTurn:0,stats:{broken:0},tstats:{broken:0,cut:0,crits:0}});
  startVolley();
  breakBlock({id:'midas-chip',boss:false,dead:false,col:0,row:0,cw:1,chh:1,dispRow:0,hp:0,maxhp:4,reward:4,kind:'square'},null);
  assert.equal(G.coins,6,'Midas and coinMult remain live for normal Cash payouts');
  assert.equal(G.volley.breakScore,4,'payout jokers do not alter base Score');
}
{
  Object.assign(G,{screen:'play',phase:'flight',coins:5,jokers:[],table:1,roundInTable:1,bossKilled:false,bossOvertime:false,tableScore:0,runScore:0,blocks:[],activeGoals:[],particles:[],floats:[],coinfx:[]});
  startVolley(); Object.assign(G.volley,{breakScore:10,completedGoals:[{label:'A',bonus:.25,cash:1},{label:'B',bonus:.5,cash:2}],cashBounty:3});
  settleVolley();
  assert.equal(G.tableScore,18,'stacked goal multiplier rounds the score once');
  assert.equal(G.coins,8,'goal Cash bounty pays out immediately at settlement, no receipt to wait on');
  assert.equal(G.phase,'aim','the volley settles straight back into aiming, no blocking receipt phase');
  assert.deepEqual(G.lastVolley.completedGoals.map(g=>g.label),['A','B'],'the last-volley breakdown records completed goals');
  assert.equal(G.lastVolley.scoreGained,18,'the last-volley breakdown records the score gained');
  assert.equal(getElement('receiptOv').classList.contains('show'),false,'the last-volley modal stays closed until tapped');
  openLastVolley();
  assert.equal(getElement('receiptOv').classList.contains('show'),true,'tapping the score stat opens the last-volley detail');
  assert.ok((getElement('receiptOv')._listeners.pointerdown||[]).length>0,'the detail modal owns its close-on-tap listener');
  getElement('receiptOv').dispatchEvent({type:'pointerdown',preventDefault(){}});
  assert.equal(getElement('receiptOv').classList.contains('show'),false,'a tap anywhere on the modal closes it');
}
{
  // banner suppression: a zero-score, zero-bounty, no-goals volley never shows the score banner
  Object.assign(G,{screen:'play',phase:'flight',coins:0,jokers:[],table:1,roundInTable:1,bossKilled:false,bossOvertime:false,tableScore:0,runScore:0,blocks:[],activeGoals:[],particles:[],floats:[],coinfx:[]});
  startVolley();
  getElement('volleyBanner').classList.add('show');
  settleVolley();
  assert.equal(getElement('volleyBanner').classList.contains('show'),false,'a zero-score, zero-bounty, no-goal volley suppresses the score banner');
}
{
  // banner appears for a scoring volley
  Object.assign(G,{screen:'play',phase:'flight',coins:0,jokers:[],table:1,roundInTable:1,bossKilled:false,bossOvertime:false,tableScore:0,runScore:0,blocks:[],activeGoals:[],particles:[],floats:[],coinfx:[]});
  startVolley(); Object.assign(G.volley,{breakScore:5});
  settleVolley();
  assert.equal(getElement('volleyBanner').classList.contains('show'),true,'a non-zero volley shows the score banner');
}
{
  // settleVolley idempotence covers the cash bounty too: a double call pays the bounty exactly once
  Object.assign(G,{screen:'play',phase:'flight',coins:0,jokers:[],table:1,roundInTable:1,bossKilled:false,bossOvertime:false,tableScore:0,runScore:0,blocks:[],activeGoals:[],particles:[],floats:[],coinfx:[]});
  startVolley(); Object.assign(G.volley,{breakScore:4,cashBounty:5});
  settleVolley(); settleVolley();
  assert.equal(G.coins,5,'a double settleVolley call pays the cash bounty exactly once, immediately at settlement');
  assert.equal(G.tableScore,4,'a double settleVolley call adds score exactly once');
}
{
  // openLastVolley is phase-gated: it must never open the detail modal mid-flight
  closeLastVolley();
  Object.assign(G,{phase:'flight'});
  openLastVolley();
  assert.equal(getElement('receiptOv').classList.contains('show'),false,'openLastVolley refuses to open while phase is flight');
  Object.assign(G,{phase:'settling'});
  openLastVolley();
  assert.equal(getElement('receiptOv').classList.contains('show'),false,'openLastVolley refuses to open while phase is settling');
  Object.assign(G,{phase:'aim'});
  openLastVolley();
  assert.equal(getElement('receiptOv').classList.contains('show'),true,'openLastVolley opens once phase returns to aim');
  closeLastVolley();
}
{
  Object.assign(G,{screen:'play',phase:'transition',table:1,roundInTable:2,bossKilled:false,bossOvertime:false,blocks:[],jokers:[],coins:0,shopVisits:0,floats:[],coinfx:[]});
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.screen,'shop','round 2 opens the scheduled shop');
  getElement('nextBtn').onclick(); assert.equal(G.phase,'aim','scheduled shop exit restores aiming');
  Object.assign(G,{table:1,screen:'cashout',phase:'transition',hasWon:false}); getElement('cashoutBtn').onclick();
  assert.equal(G.screen,'shop','post-cashout path opens the next-table shop');
  getElement('nextBtn').onclick(); assert.equal(G.phase,'aim','post-cashout shop exit restores aiming');
}
{
  Object.assign(G,{screen:'play',phase:'transition',table:2,roundInTable:6,bossKilled:true,tableScore:10,tableQuota:100,blocks:[],jokers:[],coins:0,shopVisits:0,floats:[],coinfx:[],activeGoals:[]});
  withRandomSeq(noGapPattern(7),()=>endTurn());
  assert.equal(G.collectionVolleys,1,"dead boss below quota enters collection overtime");
  assert.ok(G.blocks.some(b=>b.type==='chip'&&!b.boss),"collection overtime adds a full pressure row");
}
{
  Object.assign(G,{screen:'play',phase:'transition',table:2,roundInTable:6,bossKilled:true,tableScore:100,tableQuota:100,pendingCashout:{bossBonus:12},blocks:[],jokers:[],coins:12,shopVisits:0,floats:[],coinfx:[],activeGoals:[],tstats:{broken:0,cut:0,crits:0}});
  assert.equal(computeCashoutTally().bossBonus,12,'cashout tally preserves the boss Cash payout through collection gating');
  endTurn();
  assert.equal(G.screen,'cashout','meeting quota after boss death cashes out instead of spawning collection pressure');
  assert.equal(G.coins,12+tableClearBonus(2),'cashout adds only the table bonus after the boss payout was already earned');
}

{
  // joker tap-to-inspect tooltip
  Object.assign(G,{screen:'play',jokers:['thrifty','stash']});
  closeJokerTip();
  const tip=getElement('jokerTip');
  assert.equal(tip.classList.contains('show'),false,'tip starts closed');
  openJokerTip('thrifty');
  assert.equal(tip.classList.contains('show'),true,'openJokerTip on a held joker shows the tip');
  assert.ok(tip.innerHTML.includes(CARDS.thrifty.nm),'tip content includes the joker name');
  assert.ok(tip.innerHTML.includes(CARDS.thrifty.ds),'tip content includes the effect text');
  closeJokerTip();
  assert.equal(tip.classList.contains('show'),false,'closeJokerTip hides the tip');
  // open by index too
  openJokerTip(1);
  assert.equal(tip.classList.contains('show'),true,'openJokerTip accepts a hand index');
  assert.ok(tip.innerHTML.includes(CARDS.stash.nm),'index-based open resolves to the correct joker');
  closeJokerTip();
  // not held -> no-op
  openJokerTip('wildcard');
  assert.equal(tip.classList.contains('show'),false,'openJokerTip ignores an id that is not currently held');
  // duplicate count line
  Object.assign(G,{jokers:['thrifty','thrifty','stash']});
  openJokerTip('thrifty');
  assert.ok(tip.innerHTML.includes('×2 held'),'tip shows a held-count line when duplicated');
  closeJokerTip();
}
{
  // dismissing tap must not start aiming on the very next canvas pointerdown
  Object.assign(G,{screen:'play',jokers:['thrifty'],balls:[],queue:[],aiming:false});
  const fakeEvent={ preventDefault(){}, clientX:10, clientY:10, pointerId:1 };
  openJokerTip('thrifty');
  onDocPointerDownForTip();
  assert.equal(getElement('jokerTip').classList.contains('show'),false,'the document-level dismiss handler closes the tip');
  down(fakeEvent);
  assert.equal(G.aiming,false,'the pointerdown that dismissed the tip is consumed and does not start aiming');
  down(fakeEvent);
  assert.equal(G.aiming,true,'the following pointerdown behaves normally and starts aiming');
  G.aiming=false; G.activePointer=null;
}

console.log("game logic tests: ok");
