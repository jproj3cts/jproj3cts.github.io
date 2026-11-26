# JEKray bugs found while making the Instagram reels

A ledger kept by the @jeksystems reel runs (the private jek-insta repo drives JEKray headlessly in Playwright to record
reels). Each entry is something in the app itself that behaved wrongly or drew misleadingly while a reel was being
made. The owner asked (26 Nov 2026) for these to be logged, not worked around, so a weekly session in this repo can fix
them. Fix sessions: fix what you can, then mark the entry's status (fixed in <commit>, or "not a bug: <why>", or
"can't reproduce") and leave the entry in place; reel runs only add new entries at the end.

How the reels drive the app: a 540x960 css viewport (the phone layout) or 780 wide, deviceScaleFactor 1–2, swiftshader
WebGL, `window.JEKray` (serialize/load/byName/trace/metric/detector/elScreen/setView/select/view3d …), the page served
from `jek/` by `python3 -m http.server`. "Seen in" names the reel's recorder in jek-insta (vid/<name>.cjs) where useful.

Entry format: `## RB-<n>: <title>` then Status, Area, Found, What happens, Expected, Reproduce. "Confirmed" means
reproduced again on purpose; "reported" means seen once during a reel run and written up there, not re-checked.

---

## RB-1: J.select(null) does not clear the selection
- Status: open. Confirmed 25 Nov 2026.
- Area: scripting API (`window.JEKray.select`), bench UI.
- What happens: after a part is dropped from the parts bar it is selected; `JEKray.select(null)` leaves it selected
  and its settings sheet open. Pressing Escape does clear it.
- Expected: `select(null)` deselects (as the API reads), like Escape.
- Reproduce: 540-wide page, empty bench, drop any part from the parts bar, run `JEKray.select(null)`: still selected.

## RB-2: J.load re-fits the view, ignoring the view in the bench
- Status: open. Confirmed 25 Nov 2026.
- Area: project load / view.
- What happens: `d = JEKray.serialize(); d.view = {cx:-2, cy:-18.6, scale:4.4}; d.benches[0].view = same; JEKray.load(d)`
  on a bench with parts: afterwards `serialize().view` is a fitted view (e.g. cx -63.7, cy 0), not the one given. With
  no parts the given view holds at first, but a moment later the empty bench is re-fitted too (cx 95.71, cy -95.71).
- Expected: a bench loaded with a view opens at that view (a saved file's view should survive save → open).
- Reproduce: as above; `JEKray.setView(v)` after the load does hold.

## RB-3: At 540 px, a part dropped on the bench lands ~50 mm from the drop point, and the bench then pans
- Status: open. Confirmed 25 Nov 2026.
- Area: bench drop handling (phone layout), pointer → world mapping.
- What happens: a drop at a page point P (from `#bench`'s rect, view and scale, the same mapping `elScreen` uses) puts
  the part about 52 mm (≈ 228 px at scale 4.4) above where `elScreen` says P is; then the new part is selected, its
  sheet covers the lower half of the bench, and the view's cy shifts by ~52 mm. Each later drop shifts it again.
- Expected: the part lands under the pointer; opening the sheet shouldn't move parts already placed.
- Reproduce: 540x960 page, empty bench, view {cx:-2, cy:-18.6, scale:4.4}; dispatch a `drop` (dataTransfer
  'application/x-jekray-part' = 'source') at the page point of world (-54, 0); the new part's y is ≈ -52.

## RB-4: A mouse press on the parts bar's first group opens the bar's mode menu (Parts / Draw)
- Status: open. Confirmed 25 Nov 2026.
- Area: the parts bar (src/ui/rail.js), phone layout.
- What happens: at 540 px the mode switch (#palSwitch, "Parts ▾") overlaps the first group button ("Free space:
  Sources and detectors"); a real press near that button's centre opens the Parts/Draw menu (.rt-palmenu), which stays
  open over the bench while the group's flyout is used.
- Expected: no overlap; a press on a group opens only its flyout.
- Reproduce: 540x960, 2D, press the first group button at its centre with the mouse.

## RB-5: The light inside a lasing cavity is not drawn
- Status: open. Reported 22 Nov 2026 (vid/rcav.cjs, vid/rcavwin.cjs).
- Area: cavity rendering, 2D and 3D.
- What happens: in a lasing cavity (laser-threshold example's parts) only the thin output beam is drawn; the
  circulating beam inside the cavity is not, in 3D or 2D; on the light theme nothing inside the cavity is drawn at all.
- Expected: the intracavity beam drawn by its power, like any other beam.

## RB-6: A dead laser's microwatt seed draws at full brightness
- Status: open (possibly a design choice, but it misleads). Reported 12 and 16 Nov 2026 (vid/rleak.cjs, halve-the-pump).
- Area: drawing light by power.
- What happens: light is drawn relative to the brightest beam on the bench, so a laser below threshold (only its µW
  seed) draws the cavity as bright as a lasing one; the dead laser looks the brightest thing on the bench.
- Expected: brightness on an absolute scale, or a floor, so a dead laser looks dark.

## RB-7: The cavity's reading lags the change by a varying time
- Status: open. Reported 12 and 22 Nov 2026.
- Area: cavity solve (off the main thread) and `J.detector`.
- What happens: after a mirror's reflectivity or a window's coating changes, `J.detector(...).mw` keeps the old value
  for one trace, on one bench for about 1.1 s; a cold start and a path through other settings give different numbers
  for the same setting (90% coupler: 2.2 mW after a sweep, 1.0 mW from a fresh page).
- Expected: the reading for the current settings, and the same reading whatever the path.

## RB-8: A polygon prism with clockwise corners traces inside out
- Status: open. Reported 22 Nov 2026 (vid/rachro.cjs).
- Area: prism (shape polygon) tracing.
- What happens: a polygon prism whose corners run clockwise draws correctly but traces as if inside out (the beam
  bends toward the apex).
- Expected: either orientation traces correctly (normalise the winding), or the panel rejects/fixes it.

## RB-9: With the diffracted field on, rays or the envelope draw full light past a crossed polariser
- Status: open. Reported 24 Nov 2026 (the Faraday-filter reel).
- Area: drawing (rays/envelope with light.field on), polarisers.
- What happens: crossed polarisers with the field on: the photodiode reads 0, but the rays and the envelope still draw
  full light past the second polariser. The field drawing follows the reading.
- Expected: rays and envelope dimmed by what the polariser passes.

## RB-10: The Trap reading is cached and ignores the laser's power
- Status: open. Reported 23 Nov 2026 (smaller-bead reel).
- Area: particle / optical trap (`J.scatter`).
- What happens: after the laser's power changes, `J.scatter` returns the trap depth for the old power (a 60 nm-radius
  bead at 200 mW gave 67.1, the 100 mW value); during a power ramp it returned 0. A fresh page gives the right value.
- Expected: the trap depth for the current power (linear in power).

## RB-11: The Particle's scattered fan is drawn the same brightness at every wavelength
- Status: open. Reported 26 Nov 2026 (vid/rsky.cjs).
- Area: particle scattering, drawing.
- What happens: the scattered fan is normalised (lin or log), so blue and red look equally bright although
  `J.scatter` gives Psca(400 nm)/Psca(700 nm) = 9.7 (λ⁻⁴). Also: a real N-BK7 lens in front of the side detector made it
  read 0, and its reading lagged one trace; a source's white-light "lines" were ignored with a Gaussian source.
- Expected: scattered light drawn by its power; the detector reading the light the lens passes; lines honoured or
  the option disabled for Gaussian sources.

## RB-12: With a Gaussian beam, a stop blocks the drawn rays but the detector reads full power
- Status: open. Reported 12 Nov 2026 (chal/irisclip.cjs).
- Area: stops with gauss sources, detectors.
- What happens: a stop narrower than the beam blocks the drawn rays, but the detector after it still reads the full
  power (it needs the diffracted field to see the clipping).
- Expected: the detector's reading and the drawing agree (clip the Gaussian power, or say on the detector that it
  ignores apertures without the field).

## RB-13: Rays and the Gaussian beam disagree after a lens close to an RF horn
- Status: open. Reported 12 Nov 2026 (vid/rfocus.cjs).
- Area: rays vs Gaussian beam (RF lens antennas).
- What happens: with the lens too close to the horn the rays draw a tight bundle on the target, while the Gaussian
  beam the readout uses (`J.metric('bw')`) is 0.7 m wide.
- Expected: the drawing and the number from the same model, or both shown so they don't contradict.

## RB-14: On the dark theme the 3D view adds overlapping rays' colours (green and red wash to yellow)
- Status: open (rendering choice?). Reported 13 Nov 2026 (vid/rband.cjs).
- Area: 3D rendering, dark theme.
- What happens: 41 overlapping rays of a 532 nm green or 633 nm red laser add up to yellow on the dark theme; on the
  light theme overlapping colours draw as a red band (a rainbow reads as pink).
- Expected: a beam keeps its hue where its rays overlap.

## RB-15: The field engine fails above about a 1° axicon base angle
- Status: open. Reported 22 Nov 2026 (chal/bessheal.cjs).
- Area: diffracted field (axicon / Bessel beams).
- What happens: with an axicon of base angle above ~1° the field engine fails; and neither the 3D field volume nor the
  2D bench shows the shadow of a block in a Bessel beam's core.
- Expected: the field for steeper axicons, or a clear message of the limit.

## RB-16: A "bare" lens coat loses 8.3% whatever its R
- Status: open (check whether intended). Reported 12 Nov 2026.
- Area: coatings on lenses.
- What happens: coat {mode: 'bare'} loses 8.3% through a lens regardless of the R given; {mode: 'ar', R: 0} is lossless.
- Expected: R honoured, or R hidden for bare.

## RB-17: The cavity doesn't pick out the p polarisation at Brewster's angle
- Status: open. Reported 22 Nov 2026 (vid/rcavwin.cjs).
- Area: cavity solve with tilted windows.
- What happens: a bare N-BK7 window in a lasing cavity stops it at any tilt, even 56.6° (Brewster), where a real
  laser lases in p polarisation.
- Expected: the cavity's mode takes the polarisation with the least loss.

## RB-18: Recorded frames can show stale readouts (STILL sheets)
- Status: open. Reported 22 Nov 2026.
- Area: readouts after programmatic changes.
- What happens: after setting a value and redrawing, a screenshot taken straight away can show the previous value's
  readout (about 1 s late on cavity benches; one trace on others).
- Expected: `J.trace()` + `J.redraw()` leave readouts current, or a promise/flag says when they are.
