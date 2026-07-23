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
  "globalThis.__game={G,bossAlive,breakBlock,sellValue,refreshShop,reset};"
);
assert.notEqual(instrumented, scriptMatch[1], "game script test hook was installed");
vm.runInNewContext(instrumented, sandbox);

const { G, bossAlive, breakBlock, refreshShop, reset } = sandbox.__game;

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

console.log("game logic tests: ok");
