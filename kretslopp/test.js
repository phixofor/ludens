// Balance check for the simulation, no browser needed: node test.js
// Runs the code between //<SIM> and //</SIM> in index.html untouched ("nobody plays") and fails if the balance drifts.
const fs = require('fs'), assert = require('assert'), html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const { createSim, stepSim } = new Function(html.slice(html.indexOf('//<SIM>'), html.indexOf('//</SIM>')) + ';return { createSim, stepSim };')();
const at = html.indexOf('const WORLDS = '), WORLDS = new Function('return ' + html.slice(at + 15, html.indexOf('];', at) + 1))();
const YEAR = 600;
function run(seed, cfg, years) { // -> { died: year of death or Infinity, eaten: share of Gobbler deaths caused by Nippers while they were around }
  const sim = createSim(seed, cfg); let eaten = 0, all = 0;
  for (let t = 0; t < years * YEAR && !sim.over; t++) {
    const before = Array.from(sim.deaths.subarray(0, 6)); stepSim(sim);
    if (sim.cActive) for (let k = 0; k < 6; k++) { const d = sim.deaths[k] - before[k] * 0.985; all += d; if (k === 4) eaten += d; }
  }
  return { died: sim.over ? sim.over.tick / YEAR : Infinity, eaten: all ? eaten / all : 0 };
}
const fmt = r => (r.died === Infinity ? 'alive' : r.died.toFixed(1)) + ' (eaten ' + (r.eaten * 100).toFixed(0) + '%)';
let early = 0;
for (const [name, , cfg] of WORLDS) {
  const rs = [1, 2, 3].map(seed => run(seed, cfg, name === 'Meadow' ? 8 : 2));
  console.log(name.padEnd(15), rs.map(fmt).join('  '));
  for (const r of rs) if (r.died < 1) early++;
  if (name === 'Meadow') {
    assert(rs.filter(r => r.died < 8).length >= 2, 'Meadow: an untouched colony should usually die within 8 years');
    assert(rs.every(r => r.died >= 1.5), 'Meadow: an untouched colony must survive the first winter');
  }
}
assert(early === 0, early + ' run(s) died in year 1 without the player doing anything');
console.log('ok');
