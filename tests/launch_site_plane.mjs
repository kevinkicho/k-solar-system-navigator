/**
 * Launch-site plane-change educational sketch tests.
 */
import { planeChangeSketchForSite, planeChangeNeedAddon_m_s } from '../js/physics/launch-site-plane.js';

function assert(c, m) {
  if (!c) throw new Error(m || 'assert');
}

const ok = planeChangeSketchForSite(20, 'cape');
assert(!ok.needed, 'within band');
assert(ok.plane_change_dv_m_s === 0, 'zero addon');

const bad = planeChangeSketchForSite(45, 'cape');
assert(bad.needed, 'exceeds band');
assert(bad.plane_change_dv_m_s > 1000, `dv=${bad.plane_change_dv_m_s}`);

const none = planeChangeSketchForSite(45, 'any');
assert(!none.needed, 'any site');

const td = { body1: { name: 'Earth' } };
assert(planeChangeNeedAddon_m_s(td, 'cape', 45) > 0, 'addon earth');
assert(planeChangeNeedAddon_m_s({ body1: { name: 'Mars' } }, 'cape', 45) === 0, 'non-earth');

console.log('launch_site_plane: ok');
