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
6. **Showing a hidden part during a sweep froze the page.** On the owner's Levisense bench (second version, kept
   locally at the session scratchpad as owner/Levisense_Setup2.jekray; never commit it), with a sweep playing on the
   Particle (Screen 2 particle), the owner clicked the eye to show the STL object "FL-CUBE63CF - FL-CUBE63CF" (a cube
   that sits round the particle; the other STL objects stayed hidden, Holder and Base suppressed). The page froze.
   Likely suspects: unhiding a large STL mesh rebuilds the 3D scene and every kept step's light at once, or the cube
   now catches the particle's scattered light and its cones and field picture are worked out again for every step.
7. **A sweep stutters and seizes up when a screen shows the diffraction pattern on its face.** The owner's
   Mach–Zehnder bench (kept locally at the session scratchpad as owner/Mach-Zehnder_interferometer1.jekray): a 633 nm
   Gaussian laser, two 50/50 cubes, two flat mirrors, two screens; the field on. Mirror A's angle is swept 120 → 150°
   (sine, 0.25 Hz, field rendered) and the Combiner's tip −5 → 5° (sine, 0.25 Hz). It plays smoothly until Output 2 has
   "Show the diffraction pattern on its face" ticked (`faceMap`); then it stutters and seizes up. Likely suspect: the
   screen's face map is worked out again on the page for every frame (not rendered ahead or kept per step like the
   bench's field), or the tip sweep, not rendered ahead, forces it live. No particle is involved, so this belongs with
   item 4's general search.
8. **Redesign the electrical feedthrough.** Owner: it "shouldn't have two connectors", because a signal wired in one
   side does not come out of the other on the same tab, which is confusing. Seen: a signal generator into a
   feedthrough's input, its output to an oscilloscope's ch1: nothing reaches ch1. As built (`engines/elec.js`, kind
   `thru`): it has an `in` and an `out`, and its out gives what goes into its *partner on another tab* (feedthroughs
   pair by name, as fibre feedthroughs and link planes do); with no partner it gives zero and a note. To design with the
   owner: likely one connector per side of the wall, i.e. each feedthrough a single port on its tab and the pair the
   two ends of one wire, signals going both ways, plus a clear note when its partner is missing. Check the fibre
   feedthrough (`engines/fibre.js`) and link planes for the same confusion, and keep old benches opening.

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
