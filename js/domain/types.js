/**
 * Domain type contracts (JSDoc) — PlanSeed, PlanResult, commands.
 * Prefer these shapes at package / AI / command boundaries.
 * Not flight-certified.
 */

/**
 * @typedef {object} SurfacePointSeed
 * @property {boolean} [enabled]
 * @property {number} [lat_deg]
 * @property {number} [lon_deg]
 * @property {number} [alt_m]
 */

/**
 * @typedef {object} PlanSeedFlyby
 * @property {string} id catalog body id
 * @property {string|null} [date] YYYY-MM-DD UTC
 */

/**
 * Compact plan seed (internal + package plan_request).
 * @typedef {object} PlanSeed
 * @property {number} [v] schema hint (2+)
 * @property {string} [o] origin id
 * @property {string} [d] dest id
 * @property {string} [dep] YYYY-MM-DD
 * @property {number|null} [tof] days (ignored with flybys)
 * @property {string} [veh]
 * @property {number} [cargo]
 * @property {string} [arch]
 * @property {number} [tankers]
 * @property {string} [f9v]
 * @property {string} [eph] 'sample' | 'approx'
 * @property {string} [site] launch site id
 * @property {number} [ab] abstract budget m/s
 * @property {string} [basis] 'helio' | 'mission'
 * @property {string} [view] 'cinematic' | 'schematic'
 * @property {PlanSeedFlyby[]} [fb]
 * @property {SurfacePointSeed|null} [os]
 * @property {SurfacePointSeed|null} [ds]
 * @property {boolean} [archOmitted]
 */

/**
 * @typedef {object} PlanAssessment
 * @property {number|null} need_dv_m_s
 * @property {number|null} margin_dv_m_s
 * @property {boolean|null} feasible
 * @property {string|null} dossier_status
 * @property {boolean|null} mission_ready
 * @property {boolean|null} launch_enabled
 * @property {number} [fail_count]
 * @property {number} [warn_count]
 * @property {number|null} [confidence_0_100]
 */

/**
 * @typedef {object} PlanSolve
 * @property {boolean} ok
 * @property {boolean} isMultiLeg
 * @property {boolean} [planetRelative]
 * @property {number|null} departureSimTime
 * @property {number|null} arrivalSimTime
 * @property {number|null} transferTime_s
 * @property {string|null} origin
 * @property {string|null} destination
 * @property {number|null} [dvTotal_lambert_m_s]
 * @property {string|null} [visualFallback]
 */

/**
 * @typedef {object} PlanResult
 * @property {1} schema
 * @property {string} product_class
 * @property {string} note
 * @property {string} computedAt
 * @property {string|null} seedDigest
 * @property {PlanSeed|null} plan_request
 * @property {PlanSolve} solve
 * @property {PlanAssessment} assessment
 * @property {object} displayHints
 */

/**
 * @typedef {'present'|'analyze'|'compare'|'ops'} ProductModeId
 */

/**
 * @typedef {object} PlanCommand
 * @property {string} type
 * APPLY_SEED|COMPUTE|SET_VEHICLE|SET_DEPARTURE|SET_LAUNCH_SITE|SET_ROUTE|
 * CLEAR_ROUTE|OPEN_WINDOWS|SUGGEST_GA|SET_MODE|RUN_CAMPAIGN|UNDO|REDO|JUMP|
 * SNAPSHOT|CLEAR_HISTORY|RUN_WORKFLOW
 * @property {PlanSeed} [seed]
 * @property {boolean} [compute]
 * @property {boolean} [notifyUser]
 * @property {boolean} [recordHistory]
 * @property {boolean} [wait]
 * @property {string} [source]
 * @property {string} [label]
 * @property {number} [index]
 * @property {ProductModeId|string} [mode]
 * @property {object} [plan]
 * @property {string} [workflow]
 */

export {};
