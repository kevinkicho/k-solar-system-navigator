/**
 * Offline unit test for cloud plan summary (no live Firebase).
 */
import { planSummaryFromTransfer } from '../js/firebase/plans.js';
import { DAY } from '../js/constants.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const body1 = { name: 'Earth', id: 'earth' };
const body2 = { name: 'Mars', id: 'mars' };
const td = {
  body1,
  body2,
  transferTime: 200 * DAY,
  departureSimTime: 0,
  arrivalSimTime: 200 * DAY,
  dvTotal_lambert: 5600,
  lambertOk: true,
  isMultiLeg: false,
};

const s = planSummaryFromTransfer(td);
assert(s, 'summary exists');
assert(s.schema_version === 1, 'schema');
assert(s.kind === 'helios_plan_summary', 'kind');
assert(s.originName === 'Earth' && s.destName === 'Mars', 'names');
assert(s.label === 'Earth → Mars', 'label');
assert(Math.abs(s.tof_days - 200) < 1e-9, `tof ${s.tof_days}`);
assert(s.need_dv_m_s === 5600, 'need');
assert(s.lambertOk === true, 'lambertOk');
assert(s.departure_utc && s.arrival_utc, 'utc stamps');
assert(planSummaryFromTransfer(null) === null, 'null td');
assert(planSummaryFromTransfer({}) === null, 'empty td');

const multi = planSummaryFromTransfer({
  body1,
  body2,
  isMultiLeg: true,
  allLegsOk: true,
  transferTime: 400 * DAY,
  dvTotalMultiLeg: 12000,
});
assert(multi.isMultiLeg === true, 'multi flag');
assert(multi.need_dv_m_s === 12000, 'multi need');

console.log('firebase_plan_summary: ok');
