# JEKray: issues logged while changes are paused

Changes are paused at the owner's request (17 November 2026). Issues are logged here as they come up and done
together when the owner lifts the pause. Nothing on this list has been started unless it says so.

## Logged

1. **Changing a sweep's Steps while it plays or pre-renders crashes the page.** Seen on a Particle rod's "Axis tilt up"
   sweep, 0 → 180°, 18 steps, "Render the diffracted field" ticked, in 3D. Cause not yet found. Likely suspects:
   per-step stores (rendered frames, kept traces, kept 3D light, particle answers) or a worker job still indexed by the
   old step count.
2. **Steps, From and To should apply only when the edit is finished** (Enter or leaving the box), not on each
   keystroke. Each change discards and restarts a long render.
3. **Going into fly mode while a sweep with a particle's scattered light is rendering breaks it.** Reported by the
   owner. What "breaks" looks like (stops, wrong picture, crash) is still to be found.
   The owner then said it may instead be **sweeping the rod's tilt all the way to 360°**. Note: "Axis tilt up" was
   widened to ±180° on 16 November; a sweep ending at 360° goes past that range, so check how the value is clamped or
   wrapped mid-sweep (repeated or jumping steps, kept answers, the 3D sign), as well as fly mode on its own.
   Also: **switching the same sweep's waveform to Ramp breaks it too.** A ramp jumps from the end back to the start,
   so with a 0 → 360° range the first and last steps are the same tilt. Check that case alongside items 1 and 2:
   changing a sweep's settings while it renders or plays may share one cause with the Steps crash.
4. **A general search of sweeps with the diffracted field rendered, with no particle involved,** for the same kinds of
   failure: changing Steps, From, To, the waveform (sine, ramp, …) or the frequency while the sweep renders or plays;
   ranges past a setting's own limits; fly mode, 2D/3D switches and panel changes during a render; first and last
   steps that are the same state. Cover the sweepable settings of the main part types on the example benches, in 2D
   and 3D, and leave a browser check for each failure found.
5. **A photodetector's plot stays empty while a sweep plays.** The owner's bench: the Particle rod's "Axis tilt up"
   swept −180 → 180° in 60 steps with the field rendered. The detector's panel shows its readings (DC 0.2622 mW, beats
   at 1 GHz and 2 GHz with swing and phase), but its plot (V against "time, last 3 ns (rolling)") draws nothing. The
   owner expected it to plot. Find whether the plot is empty because the signal is drawn on a ns time axis while the
   sweep moves on a seconds scale, or because the sweep's kept steps or worker traces do not feed it. Decide with the
   owner what it should show during a sweep: the reading against the swept value, or a rolling history.

## Also outstanding

- **Particle in a cavity, round 6** (the mode solve near degeneracy): on `claude/ecstatic-maxwell-ymsuji`, not on main.
  It needs the whole validation page run before main. Record: `jek/tools/validation/notes/particle-cavity.md`.
- **Smoothness, what remains:**
  - the first cycle of a rod sweep builds each step's 3D light once (about 120 ms a step);
  - particle and fibre benches trace on the page when a drag is let go;
  - Fabry–Perot in 3D runs about 1 s of field FFTs while orbiting;
  - the mm-wave horn panels take 0.7–1.0 s to open;
  - opening a bench takes 1.7–2.1 s.
- **Share links lose the bench's Light settings** (`shareData()` never writes `light`), found while building Suppress.
