# Multi-rev Lambert spike notes (PR7a)

> **AS-BUILT 2026-08-02:** Product default is multi-rev **ON** (pathAccuracy.multiRevLambert: true, max 1). Auto also for TOF > 400 d. Spike body text below may still say default OFF — treat as history.

## Status
Implemented as product path under feature flag `pathAccuracy.multiRevLambert` (default **OFF**).

## Algorithm (HELIOS)
- Universal-variable Lambert (`js/physics/lambert.js`)
- Transfer angle \(\theta + 2\pi N\) for \(N\) extra revolutions
- Multi-rev search windows between singularities \((2\pi N)^2\) and \((2\pi(N+1))^2\)
- Best branch enumerates \(N=0..N_{max}\), short/long, min +öv, miss &lt; 1000 km

## Bibliography
1. Gooding, R. H. (1990). GÇ£A procedure for the solution of LambertGÇÖs orbital boundary-value problem.GÇ¥
2. Izzo, D. (2015). GÇ£Revisiting LambertGÇÖs problem.GÇ¥
3. Vallado, *Fundamentals of Astrodynamics and Applications*

## Validation
- `tests/lambert_multirev.mjs` GÇö N=0 regression + Nmax=1 search closes miss
- Interactive UI: checkbox GÇ£Multi-rev Lambert (NGëñ1)GÇ¥ then **recompute transfer**

## Limits
- Educational, not flight-cert
- Not used in porkchop cells by default
- High-e / outer cases may still prefer N=0 for cost
