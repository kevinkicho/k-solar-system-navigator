# Multi-rev Lambert spike notes (PR7a)

## Status
Implemented as product path under feature flag `pathAccuracy.multiRevLambert` (default **OFF**).

## Algorithm (HELIOS)
- Universal-variable Lambert (`js/physics/lambert.js`)
- Transfer angle \(\theta + 2\pi N\) for \(N\) extra revolutions
- Multi-rev search windows between singularities \((2\pi N)^2\) and \((2\pi(N+1))^2\)
- Best branch enumerates \(N=0..N_{max}\), short/long, min Δv, miss &lt; 1000 km

## Bibliography
1. Gooding, R. H. (1990). “A procedure for the solution of Lambert’s orbital boundary-value problem.”
2. Izzo, D. (2015). “Revisiting Lambert’s problem.”
3. Vallado, *Fundamentals of Astrodynamics and Applications*

## Validation
- `tests/lambert_multirev.mjs` — N=0 regression + Nmax=1 search closes miss
- Interactive UI: checkbox “Multi-rev Lambert (N≤1)” then **recompute transfer**

## Limits
- Educational, not flight-cert
- Not used in porkchop cells by default
- High-e / outer cases may still prefer N=0 for cost
