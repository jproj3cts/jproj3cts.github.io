# A particle inside a cavity: where the work stands

Paused on 16 November 2026 at the owner's request. This note is the place to pick it up again.

Everything here is reached only through the Particle part. The empty cavity's own solve (`engines/cavity.js`) was not changed by any of it.

## What is on main

- **The mode solve** (`engines/scatter-cavity.js`) for a stable, unclipped, non-degenerate two-mirror cavity. It is checked against `validation/scripts/scatter_cavity.py` in the validation case `scatter-cavity` (452 checks, all pass).
- **The degeneracy rule.** A cavity is degenerate if the modes q orders up (q up to 6) resonate within three linewidths of TEM00. This was changed from the first rule with the owner's agreement.
- **The pupil solve** for a degenerate cavity (`engines/scatter-pupil.js`, `engines/scatter-pupil-map.js`). The particle's light is followed by direction through every return, on a map the bench's own tracer makes. It is checked in the validation case `scatter-cavity-degen`: 12 comparisons, all within 2% (5% for the cavities short of concentric).
- **The reference was corrected three times**, each with a dated note in `scatter_cavity_degen.py`:
  - the off-axis Mie returns are traced ray by ray;
  - the overlap is taken over the whole cap;
  - each return is weighted by its change of solid angle, with its focal lines counted.

  The weight's convention was fixed by checks outside both codes: a Fresnel propagation (`gouy1d.py`) and a mode-by-mode count (`modal.py`).

## The warning flags (on main since 16 November 2026)

Two warnings in the Scattering tab, from `cavUnchecked` in `scatter-cavity.js`:
- `pupilFar`: a degenerate cavity more than 0.25 rad of round-trip Gouy phase from re-imaging.
- `modeNear`: the mode solve with transverse modes stepping by under 1 rad a round trip.

## Round 6: on the feature branch `claude/ecstatic-maxwell-ymsuji` only

Round 6 (the mode solve near degeneracy, first commit `5faea4af`) is held back from main: main carries a revert of it, and the feature branch carries the revert of that revert. Node and browser suites pass with it, but **the whole validation page has not been run on it**. Before it goes to main: run the validation page, rebuild every app, run the full suite, then merge the branch (its revert of the revert brings round 6 with it).

## Round 6 in short

Keeping more modes cannot fix the mode solve near degeneracy. In a paraxial count the change of |E|² at the particle does not settle with the order kept, at the mirror rim or past it.

The fix: where the tracer's map shows the particle's returns re-imaged (within 0.065 of the cavity's length) and fading within 500 reflections, the mode solve takes its four sums from the returns followed ray by ray, the pupil solve's chains, in place of its mode list. The list stays everywhere else, including the cavity in `scatter-cavity`, whose numbers do not move at all.

Results with 90% mirrors 2 mm across, R = 10 mm, a 50 nm dipole at the middle. The tolerance was 5%, written before the runs.

| Short of concentric | Gouy phase | Reference | Mode list (before) | With the returns | Off by |
|---|---|---|---|---|---|
| 0.52 mm | 0.65 rad | −1.889e-5 | −1.04e-5 | −1.875e-5 | −0.7% |
| 0.6 mm (M1) | 0.696 rad | +1.130e-5 | −3.23e-6 | +1.116e-5 | −1.2% |
| 0.8 mm (M2) | 0.805 rad | −1.932e-5 | −6.03e-6 | −1.955e-5 | +1.2% |
| 1.0 mm (M3) | 0.902 rad | −3.852e-5 | +1.3e-7 | −3.811e-5 | −1.1% |
| 1.08 mm | 0.935 rad | +1.673e-5 | +3.14e-6 | +1.663e-5 | −0.6% |

- **Shift and widening:** unchanged to every digit. They come from TEM00's pole, which the returns do not enter.
- **Cost:** the first trace on M1 goes from about 3 s to about 24 s. Later solves are 2–3 s as before. The validated cavity is unchanged.
- **Mirrors 5 mm across:** the returns cross too far from the particle and the fix is not reliable there (+25% at 0.6 mm). The warning stays.
- **4.0 mm short (1.855 rad):** the reference does not converge and the number is too small to check.
- **99%, 50 µm short:** the returns take about 4100 reflections to fade, over the 500 allowed, so the mode list stands with its warning.

## Still open, in the order proposed

1. **Finish round 6:** run the validation page, review, and decide what happens to the `modeNear` warning, whose 1 rad threshold was a guess. Then main, with the owner's say-so.
2. **The pupil solve far from re-imaging** (pupilFar). It is 2–7% out at 0.4 rad and 28% at 0.6 rad. The suspected cause, untested: the map is built from offsets 1 µm from the particle while the returns cross up to 0.37 mm away. Test the cause first, then rebuild the map from where the returns cross, and add cases at 0.2 and 0.45 mm short.
3. **99% / 50 µm short:** no reference converges. It needs a better arbiter, such as a full mode sum with a proper rim.
4. **Smaller checks:**
   - the off-axis confocal sign convention has one independent check;
   - tipped mirrors have not been run with the weight;
   - the reference's on-axis Mie values were not re-run after the weight.
5. **Speed:** a first Mie solve takes 23–32 s, a re-solve 6.5 s. A multipole form of the Mie response would be needed to go lower.
6. **Empty-cavity edge cases, none measured:**
   - more than 40 modes excited;
   - finesse above about 30,000;
   - scan peaks narrower than 1/2048 of a free spectral range;
   - a non-planar ring.
7. **Gas damping:** the validation case still fails 3 checks, kept as a failure on the owner's instruction.

## Records

- `particle-cavity-tolerances.md`: every tolerance, written down before its runs, round by round. A tolerance is not changed to make a check pass; any change needs the owner's say-so.
- `particle-cavity-scripts/`: the analysis scripts the findings rest on.
  - `gouy1d.py`: the Fresnel check of the weight's convention.
  - `modal.py`, `paraxord.py`, `paraxtail.py`: mode-by-mode counts.
  - `refc.py`, `refjac.py`, `ref99.py`: the reference's variants and convergence runs.
  - `bisect.mjs`: the traced map against exact rays.
  - `r4.mjs`, `r6.mjs`: JEKray's solves on one bench.

  Paths in them are relative to this folder; run them from it.
