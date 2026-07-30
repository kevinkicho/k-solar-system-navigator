/**
 * Offline tests for screen-space label layout helpers.
 */
import { resolveLabelOverlaps, updateLabelDistanceFade } from '../js/scene/label-layout.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

// Pure API surface (DOM layout needs browser; CI UI covers live path)
assert(typeof resolveLabelOverlaps === 'function', 'resolveLabelOverlaps export');
assert(typeof updateLabelDistanceFade === 'function', 'updateLabelDistanceFade export');

// No-DOM call must not throw
resolveLabelOverlaps();

console.log('label_layout: ok');
