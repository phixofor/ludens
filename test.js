// Rules and balance check, no browser needed: node test.js
// Runs the code between //<SIM> and //</SIM> in index.html untouched.
const fs = require('fs'), assert = require('assert'), html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const S = new Function(html.slice(html.indexOf('//<SIM>'), html.indexOf('//</SIM>')) + ';return { W, BOONS, FORMS, createSim, stepSim, aim, bot, pick, applyBoon, spawn, need };')();
const DT = 1 / 60;

function quiet(form) { // an empty arena where nothing arrives on its own
  const s = S.createSim(1, 720, form); s.foes.length = 0; s.spawn = s.nextEvent = s.nextBoss = 1e9; return s;
}
function circle(s, cx, cy, r, secs = 2) { // fly a circle around a point
  for (let t = 0; t < secs; t += DT) {
    const a = Math.atan2(s.y - cy, s.x - cx) + .35; // aim a little ahead on the circle
    S.aim(s, cx + Math.cos(a) * r, cy + Math.sin(a) * r); S.stepSim(s, DT);
  }
}

// 1. Circling a thing swallows it; the k-th swallow in one loop is worth k times as much.
{
  const s = quiet();
  for (const [x, y] of [[200, 300], [210, 310], [190, 295]]) S.spawn(s, 'mote', x, y, { warm: 99 });
  circle(s, 200, 300, 50);
  assert.strictEqual(s.eaten, 3, 'three motes inside one loop are swallowed');
  assert.strictEqual(s.score, 10 + 20 + 30, 'combo scoring');
  assert.strictEqual(s.best, 3);
  assert(s.len <= s.maxLen + 10, 'the tail stays within its length');
}
// 2. An anchor blocks a loop unless it is alone.
{
  const s = quiet();
  S.spawn(s, 'anchor', 200, 300, { warm: 99 }); S.spawn(s, 'mote', 215, 300, { warm: 99 });
  circle(s, 200, 300, 50);
  assert.strictEqual(s.eaten, 0, 'anchor + mote: the loop fails');
  s.foes = s.foes.filter(f => f.type === 'anchor');
  circle(s, 200, 300, 50);
  assert.strictEqual(s.eaten, 1, 'a lone anchor is swallowed');
}
// 3. Armour takes one loop per layer; Crushing Coil takes more.
{
  const s = quiet(); S.spawn(s, 'brute', 200, 300, { warm: 99 });
  circle(s, 200, 300, 55, 1.2); assert.strictEqual(s.eaten, 0, 'one loop only cracks a brute');
  circle(s, 200, 300, 55, 4); assert.strictEqual(s.eaten, 1, 'three loops break it');
  const c = quiet(); S.applyBoon(c, 'crush'); S.applyBoon(c, 'crush'); S.spawn(c, 'brute', 200, 300, { warm: 99 });
  circle(c, 200, 300, 55, 1.2); assert.strictEqual(c.eaten, 1, 'Crushing Coil x2 breaks it in one');
}
// 4. Touching the Hush costs a heart, then the game ends.
{
  const s = quiet(); S.spawn(s, 'seeker', s.x + 60, s.y);
  for (let i = 0; i < 600 && s.hearts === 3; i++) S.stepSim(s, DT);
  assert.strictEqual(s.hearts, 2, 'a seeker reaches an idle wyrm'); assert(s.inv > 0);
}

function run(seed, form, play, maxT = 900) {
  const s = S.createSim(seed, 720, form);
  while (!s.over && s.t < maxT) { if (play) S.bot(s); S.stepSim(s, DT); if (s.choices) S.pick(s, seed % s.choices.length); }
  return s;
}
// 5. Same seed, same night.
assert.strictEqual(run(7, 'ember', true, 60).score, run(7, 'ember', true, 60).score, 'the sim is deterministic');

// 6. Balance, measured with the bot (a crude player that circles the nearest thing).
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const idle = seeds.map(z => run(z, 'ember', false).t);
console.log('idle   dies at', idle.map(t => t.toFixed(0)).join(' '));
assert(Math.min(...idle) > 12, 'doing nothing must not kill you in the opening seconds');
assert(Math.max(...idle) < 120, 'doing nothing must kill you');
for (const form in S.FORMS) {
  const rs = seeds.map(z => run(z, form, true));
  console.log(form.padEnd(9), 'bot dies at', rs.map(r => r.t.toFixed(0).padStart(3)).join(' '), ' median', med(rs.map(r => r.t)).toFixed(0) + 's', ' score', med(rs.map(r => r.score)), ' boons', med(rs.map(r => r.level)), ' best catch', Math.max(...rs.map(r => r.best)));
  assert(rs.every(r => r.over), 'every night ends, whatever the build');
  if (form === 'ember') {
    assert(med(rs.map(r => r.t)) > med(idle) * 1.5, 'playing must beat not playing');
    assert(med(rs.map(r => r.t)) < 600, 'a crude bot must not survive for ever');
    assert(med(rs.map(r => r.level)) >= 3, 'boons must arrive at a steady pace');
  }
}
// 7. Every boon at full strength, all at once, for a whole night: nothing may throw or go NaN.
{
  const s = S.createSim(3, 720, 'ember');
  for (const id in S.BOONS) if (id !== 'hubris') for (let i = 0; i < S.BOONS[id].max; i++) S.applyBoon(s, id);
  s.hearts = s.maxHearts = 50;
  while (!s.over && s.t < 480) { S.bot(s); S.stepSim(s, DT); if (s.choices) S.pick(s, 0); }
  assert(Number.isFinite(s.score) && Number.isFinite(s.x) && Number.isFinite(s.len), 'no NaN');
  assert(s.foes.every(f => Number.isFinite(f.x) && Number.isFinite(f.y)), 'no NaN foes');
  console.log('all boons: t', s.t.toFixed(0), 'score', s.score, 'best catch', s.best, 'eclipses', s.slain, 'dawn', s.dawn);
}
console.log('ok');
