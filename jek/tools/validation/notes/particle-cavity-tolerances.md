# Particle part and scattered light: tolerances, written before the first run

Written 12 Nov 2026, before any of these tests or validation cases had been run. They are not to be loosened.
A check that fails stays on the page and in the report as a failure.

Reference case unless said: 300 nm silica sphere (n from the glass list), 1550 nm, vacuum.

## Node physics tests (test/node/physics-particle.test.mjs)

| # | Check | Tolerance |
|---|---|---|
| N1 | Power launched into a cone (sum of its rays' powers) against direct quadrature of the exact Mie far field over the same solid angle (a fine coneGrid, 40 x 80), half-angles 10, 30 and 60 degrees, forward and at 90 degrees | 0.5 % relative |
| N2 | Two cones of half-angle 90 degrees (forward and back) together against the scattered power P_sca | 0.5 % relative |
| N3 | On the bench: six square screens closing a box round the particle; the sum of the shares caught | within 5 % of 1 (square faces are sampled by a round cone and cut ray by ray) |
| N4 | A cone's field at a collecting aperture (a detector facing the particle, no optics between), ray by ray, against the exact Mie far field F e^{ikr}/r at the same points: amplitude | 1 % of the peak amplitude |
| N5 | the same: phase, relative to the cone's centre ray (so across the aperture) | 0.02 rad |
| N6 | the same: phase of the centre ray against the driving beam's phase at the particle plus k r plus arg F (absolute, as the detector's interference needs it) | 0.02 rad |
| N7 | the same: polarisation, each of s and p against the exact field's | 1 % of the peak amplitude |
| N8 | Out of the plane: a detector raised above the bench plane and tipped to face the particle; caught power against direct quadrature | 1 % relative |
| N9 | Out of the plane: its field as N4 to N7 | same tolerances |
| N10 | Coherence: a local oscillator split from the same laser onto the detector that collects side scatter; the interference term against 2 Re of the independent overlap integral (exact Mie field times the Gaussian), at two LO phases a quarter wave apart | 2 % of the term's amplitude |
| N11 | Coherence: the same with the LO from a separate laser: no interference term | below 1e-9 of the LO power |
| N12 | Energy, wide beam (collimated Gaussian, plane wave at the particle), non-absorbing sphere: detector reading with the particle less the reading without, against -(P_ext - P_sca into the detector's solid angle), P_ext = C_ext I_0 from Mie | 2 % of P_ext |
| N13 | Energy, absorbing sphere (gold, 100 nm): the same; P_ext - P_sca,det now holds the absorbed power | 2 % of P_ext |
| N14 | Energy, the tight focus (NA 0.8 objective, a like collection lens, a detector catching all it passes): reading with less without against -(P_ext - P_sca into the collection lens) | 5 % of P_ext |
| N15 | Position signal (split detector behind a collection lens, gentle focus, small sphere): odd in displacement, |S(x) + S(-x)| | 1 % of |S(x)| |
| N16 | Position signal: linear near zero, S(x/2) against S(x)/2 at x = 0.05 w0 | 2 % |
| N17 | Position signal: slope at zero against an independent numerical integration (Python, validation/scripts) | 3 % |
| N18 | Collected power into a lens of NA 0.5, forward and at 90 degrees: the lens's share against the scattering engine's own cone integral (exact far field, coneGrid) | 0.5 % relative |
| N19 | the detector behind that (ideal) lens reads the collected power | 1 % relative |
| N20 | An old bench (particle on a screen): scattering numbers unchanged from before the change (P_sca, C_sca, collected fraction) | 1e-9 relative |
| N21 | The particle does not change the main beam: detector reading with the particle's light switched off equals the reading with no particle | 1e-12 relative |

## Validation page (area Scattering), against independent Python scripts

| Case | Check | Tolerance |
|---|---|---|
| scatter-energy | wide beam, silica sphere: the change in a forward detector's reading against -(C_ext I_0 - P_sca,det) from the script's own Mie sum | 2 % of P_ext |
| scatter-energy-abs | gold sphere | 2 % of P_ext |
| scatter-position | split-detector slope against the script's integration | 3 % |
| scatter-collect | share into NA 0.5 forward and at 90 degrees against the script's Mie pattern integrated over the cone, for the plane-wave case | 1 % relative |

## Performance

Retrace time of the example bench with the scattered light on: at most 3 times the time with it off, and under 150 ms in Node on this machine.

## Ray counts (bounded)

Per particle and per coherent launch: one fan of at most 200 directions traced one step, and for each catching part
(at most 8 followed) a cone of 8 x 24 rays, each with two companions for the tube's area.

---

# Results (added after the runs, 13 Nov 2026; nothing above was changed)

| # | Result | Verdict |
|---|---|---|
| N1 | worst cone 1.5e-5 | pass |
| N2 | 1.2e-5 | pass |
| N3 | shares add to 0.990 | pass (first run 0.931, a fail: the cone's rings were then even in solid angle; they are now Gauss-Legendre in the angle from the axis) |
| N4 | 1.0e-5 of the peak | pass |
| N5 | 3.6e-8 rad | pass |
| N6 | 1.2e-8 rad | pass |
| N7 | 1.0e-5 of the peak | pass |
| N8 | 1.3e-5 | pass |
| N9 | 7.3e-6, 2.7e-7 rad, 4.1e-9 rad, 6.5e-6 | pass |
| N10 | 0.22 % | pass (first run 6 % out: the test bench's laser body stood beside the particle and shaded part of the cone; the laser was moved back 20 mm, the tolerance not touched) |
| N11 | exactly 0 | pass |
| N12 | 0.080 % of P_ext | pass |
| N13 | 0.189 % of P_ext | pass |
| N14 | 0 (to 1e-9) | pass, but by construction: in a tight focus the interference is the optical theorem wave by wave. Read through the bench's Gaussian beam instead, as first built, it was 5.3 % high: a fail of this tolerance for that route, which is why the route was changed |
| N15 | 1.1e-9 | pass |
| N16 | 0.32 % | pass |
| N17 | 2.8 % at the default cone (1.8 % with a cone four times finer) | pass, narrowly |
| N18 | 6.3e-6 ahead, 8.9e-6 at 90 degrees | pass |
| N19 | 2.5e-16 | pass |
| N20 | identical to the old code's figures (run on commit e54db8d4 itself) | pass. The collected-power figure first written into the test was wrong (taken from a run with a different cone direction); the old code was run again to get it |
| N21 | identical | pass |

Validation page: scatter-energy (silica -46.0003 nW against -45.9635; gold -2.6711 against -2.6661), scatter-position (4.194e-6 per um against 4.316e-6, -2.8 %), scatter-collect (shares within 0.13 %): all pass. The gold case was folded into scatter-energy as its second pair of checks.

Performance: FAILS the first of the two criteria written above. Retrace of the example bench in Node, median of 30: 3.4 ms with the particle's light off, 43 ms with it on: 13 times, not 3. Under the 150 ms bound. 793 probe rays, 2068 rays launched (three cones of 576 and 316 rays for the focus's waves); the tracer costs about 12 us a ray.

Ray counts as built: a fan of 132 and 17 looks a part in the first probe; 192 a cone (and a patch of 192 where a driving beam is narrow in it) in the second; up to 10 cones followed, three rays a direction; a focus's waves in at most 20 x 20 bins, one ray each.

---

# Follow-ups (written 13 Nov 2026 before any of this was built or run; not to be loosened)

## Speed
No tolerance of any existing check is changed. Every existing check (N1 to N21, the validation cases, the browser checks) must pass as written.
Aim: retrace of the example bench with the particle's light on at most 3 times the time with it off. Reported as measured, whether or not it is met.

## Cones adding as fields (physics-particle.test.mjs)
| # | Check | Tolerance |
|---|---|---|
| F1 | One particle, a detector reached directly and by a flat mirror behind the particle: the interference term between the two cones on the detector (reading less the two cones' own powers) against the two-path integral worked out in the test from the exact Mie far field (direct wave and the wave from the mirror image, with the mirror's reflection), at five mirror positions over half a wavelength | 2 % of 2 sqrt(P1 P2) at each position |
| F2 | the fringe: largest less smallest reading over those positions against the independent integral's | 2 % |
| F3 | Two Particle parts in one laser's beam, one detector at 90 degrees seeing both: interference term against the independent two-source integral | 2 % of 2 sqrt(P1 P2) |
| F4 | the same with the second particle in a second laser's beam: no interference between the cones | below 1e-9 of the cones' power |
| F5 | The box of six screens still sums to 1 | within 5 % (N3, unchanged) |

## Tight-focus position signal
Reference: jek/tools/validation/scripts/scatter_position_focus.py. The bench's objective taken as an ideal thin lens (a ray at height rho leaves towards the focus, rho = f tan(theta)) that keeps the energy along each ray, focusing the bench's Gaussian beam; the sphere's field by Mie through the angular spectrum; all light inside the collection NA on a detector split in two.
| # | Check | Tolerance |
|---|---|---|
| P1 | The script at low NA (the gentle-focus bench: waist 6.58 um, 100 nm sphere) against Gittes and Schmidt's closed form | 2 % |
| P2 | the script at low NA against scatter_bench.py's slope (4.31569e-6 per um) | 1 % |
| P3 | JEKray's tight-focus slope (300 nm sphere, NA 0.8 objective filled as on the example bench, light polarised out of the plane, moved in the plane) against the script | 5 % |
| P4 | the same, light polarised in the plane (moved along the polarisation) | 5 % |
P3 and P4 are a validation case (scatter-position-focus) and a Node test. If they fail they stay failing, with the cause written beside them.

### Amendment to the tight-focus reference, written before the script existed or anything was run
Reading engines/vector-focus.js (its line "not after a thin mask, which holds the field in its plane") shows the bench's objective, a Mask part, is deliberately taken as a thin mask: the Gaussian's transverse field is kept on the mask's plane and only its phase changed. That is a different idealisation of a lens from the one written above (energy kept along each ray), and the two cannot agree at NA 0.8 whatever the scattering code does. The script therefore works out three lenses: (a) the thin mask, by the vector angular spectrum of the field on its plane, which is the bench's part; (b) the energy-keeping thin lens written above; (c) an aplanatic lens (Richards and Wolf). The validation case and the Node test compare JEKray with (a), at the 5 % already written (P3, P4). JEKray against (b) and (c) is reported as numbers, not as a pass or fail: it measures how much the choice of ideal lens matters, not whether the code is right. P1 and P2 stand as written, for every lens model (at low NA the three agree).

### Results of the cones-as-fields checks (after the runs)
F1: first run failed an extra check in the test (the two cones' own powers 5.3 % low; the interference itself was not reached). Cause: the mirror's cone overfilled the 0.4 mm detector and only its rays that landed were counted, which cut the face along the cone's rings. A bundle wider than the face is now summed over the face. Then: interference within 1.4e-4 of 2 sqrt(P1 P2) at all five mirror positions. F2: fringe 1.67475e-9 against 1.67513e-9 mW (2.3e-4). F3: first run stopped on a check of the test's own design (the two spheres happened to be lit a quarter wave apart, so there was almost no interference to compare); the second sphere was moved to a whole number of waves; then 5.9e-5. F4: exactly 0. F5 (N3): 0.990, unchanged.

### Results of the speed work and the tight-focus reference (after the runs)
Speed: 3x NOT met. Example bench, Node, medians of 40: light off 3.1 to 3.8 ms; light on 42.6 to 49.9 ms before (11 to 13 times), 17 to 21 ms after (about 5.5 times; 4.7 to 6 over repeated runs). Every existing check passes at its tolerance, margins unchanged (N4 1.1e-5, N17 2.8 %).
P1 (script against Gittes and Schmidt, low NA): mask -0.8 %, thin lens -0.7 %, aplanatic +1.1 %: pass.
P2 (script against scatter_bench.py, 1 %): FAILS for the mask (-1.9 %) and the thin lens (-1.8 %); passes for the aplanatic lens (-0.04 %). Left failing and recorded in the script's output and the reference file. Cause: scatter_bench.py takes the paraxial waist, which is an aplanatic lens's; a lens with rho = f tan(theta) makes a slightly wider focus even at NA 0.07. A third check written into the script (the interference over the whole cone against -C_ext I_0 of the paraxial waist, 1 %) fails the same way for the same reason (-1.1 %).
P3: JEKray 0.039509 per um against the mask reference 0.0392926: +0.55 %. Pass.
P4: JEKray 0.032467 against 0.0323136: +0.48 %. Pass.
Against the other lenses (numbers only): thin lens 0.0409256 / 0.0328643, aplanatic 0.0415283 / 0.0323849 per um.

---

# A particle in the focus of a real glass lens (written 13 Nov 2026 before the bench or the script existed; not to be loosened)

Lens: a plano-hyperbolic asphere in N-BK7, flat face to the collimated beam, the second face a conic with k = -n^2 (n the glass's index at 1550 nm) and R = -(n - 1) L, L = 4 mm from its vertex to the focus; exactly stigmatic for a collimated beam at 1550 nm by Fermat's principle, no higher aspheric terms needed. Clear aperture to NA 0.6. Beam 1/e^2 radius 2 mm, 100 mW. Faces with a coating that reflects nothing (custom, R = 0) for the main case; bare for the last two checks. Collection lens: the same lens turned round, its focus on the particle.
Reference: scatter_position_focus.py extended with a lens traced exactly in Python from the prescription (heights to exit angles, optical path, Fresnel transmission of each polarisation where a face is bare), the pupil's amplitude by energy along ray tubes.

| # | Check | Tolerance |
|---|---|---|
| G0 | vfPupil's route for the beam after the lens is 'traced', and the scattering run takes the focus as plane waves (pupils 1) | must hold |
| G1 | Full width at half maximum of the irradiance at the focus, across the polarisation and along it | 2 % each |
| G2 | Peak irradiance at the focus | 2 % |
| G3 | The axial field component: its largest |E_x|^2 on the line through the focus along the polarisation, over the peak irradiance's |E|^2 | 5 % of the ratio |
| G4 | Energy: detector reading with the particle's light on less off, against -(P_ext - caught by the collection lens) | 1e-6 of P_ext (expected true by construction on this route; said so if it is) |
| G5 | Scattered power in that focus against the reference (Mie through the traced angular spectrum) | 2 % |
| G6 | Share of the scattered power into the collection lens against the reference's Mie pattern over the lens's cone | 1 % |
| G7 | Split-detector slope, light polarised out of the plane and in it | 5 % each |
| G8 | Bare faces: peak irradiance at the focus over the coated lens's, against the reference's ratio | 1 % |
| G9 | Bare faces: the beam's power on the detector behind both lenses over the coated bench's, against the reference (the four faces' transmissions over the beam) | 1 % |
The lens's residual aberration (rms wavefront from JEKray's ray fan, and the Python trace's optical path spread) is reported beside these.

### Results of the real-lens checks (after the runs)
Deviation from the text above, decided before any comparison was run: the lens was built clear to NA 0.5, with a 1.7 mm beam and a 2.5 mm centre thickness, in place of NA 0.6 and a 2 mm beam. At NA 0.6 this hyperbola needs a semi-aperture of 6 mm and a sag of 4 mm, deeper than any sensible thickness. As built: n = 1.50065, R = -2.0026 mm, k = -2.25196, semi-aperture 3.342 mm, sag at the edge 1.789 mm, marginal ray 30.0 deg. The tolerances are unchanged.
Lens residual: the Python trace's optical path spread across the aperture 5.6e-13 waves; JEKray's ray fan at the focus rms spot 8.4e-16 mm, wavefront rms 2.4e-14 mm (free of aberration by design).
A bug in the reference was found and fixed before the final comparison: its first share into the collection lens (0.11654) cut the full sphere's quadrature grid at the cone's edge, a ring out either way; on a grid of the cone's own it is 0.1089579 (the scattering engine's own cone integral gives 0.1089579 too).
G0: route 'traced', pupils 1, 1224 waves; the brightest point on the axis is at vertex + L to 1 um. PASS.
G1: FWHM across 1.9482 against 1.9459 um (+0.12 %), along 2.0330 against 2.0312 (+0.09 %) (17-point scan, 0.18 um steps; on a 0.06 um scan +0.014 % and +0.009 %). PASS.
G2: peak 2.461056e10 against 2.461528e10 W/m^2 (-0.019 %). PASS.
G3: axial ratio 0.02073 against 0.02074 (scan: within 0.5 %). PASS.
G4: change -39.620495 uW against -(P_ext - caught) -39.620495: by construction on this route (the interference is the optical theorem wave by wave). PASS.
G5: P_sca 4.446531e-5 against 4.447386e-5 W (-0.019 %). PASS.
G6: share 0.108957 against 0.1089579 (6e-6). PASS.
G7: slope s 8.387246e-3 against 8.377824e-3 per um (+0.11 %), p 7.874309e-3 against 7.865299e-3 (+0.12 %). PASS.
G8: bare over coated peak 0.903488 against 0.903482 (7e-6). PASS.
G9: bare over coated beam behind both lenses 0.849051 against 0.834152 (+1.79 %). FAILS, left failing (validation page and a todo test). Cause: a Gaussian beam on the bench is carried by its axis ray and loses what the axis ray loses at a bare face (0.96^4); the light at this lens's edge meets the curved faces at up to 30 deg and loses more. The focus is built from traced rays and has each ray's own loss, hence G8 passes.
Numbers only (no tolerance written): bare slopes s 7.813e-3, p 7.727e-3 per um against 7.895e-3, 7.814e-3 behind the bare collection lens (-1.0 %, -1.1 %; the same beam power is the denominator).
Reflections: with ghosts off a bare face's reflection is dropped (it counts only as the transmitted light's loss). With Follow weak reflections on, the collection lens's flat face sends about 3.5 % of the power back through its own focus onto the particle (routes traced, traced plus five weak 'beam' legs), added as a field: the light on the particle went from 0.68 to 1.41 times its value as the collection lens was moved in 0.1 um steps, as (1 +- sqrt(0.035))^2 predicts.

---

# A retro-reflected trap: the beam refocused onto the particle (written 13 Nov 2026 before the bench or the script existed; not to be loosened)

Bench: one 1550 nm laser, 100 mW, 1/e^2 radius 1.5 mm, polarised out of the plane (s) unless said; a 50/50 plate (a mirror part, reflect 50, transmit 50, at 45 deg) between the laser and the first lens; an ideal lens (thin mask, f) focusing onto the 300 nm silica Particle; a like lens at 2f recollimating; a flat partial mirror (reflect 50, transmit 50) a few mm past it, square to the beam, sending the light back to refocus on the particle. A split photodetector behind the mirror (forward) and one on the plate's return port (backward). Two foci: tight, f = 2 mm, lenses 5.333 mm across (NA 0.8, the pupil route); gentle, f = 15 mm (beam NA about 0.1, the Gaussian route). The mirror moved in nine steps of lambda/16 (half a wavelength in all).
Reference: a script sharing no JEKray code. The forward focus as plane waves from the first lens (the 'mask' rule of scatter_position_focus.py, which JEKray matched before), the return focus its mirror image, A_b(R d) = c R A_f(d), with c = -r_M exp(2ik L): L the distance from the focus to the mirror, r_M the mirror's amplitude reflection as JEKray's mirror part defines it (read from the code, trace.js: -sqrt(R) for each polarisation from the coated face), and the -1 of the thin-mask relay (Rayleigh-Sommerfeld through the focus and back, the Gouy phase). Mie theory through the combined spectrum. Detectors as interference over the directions each catches: forward, the forward beam and the scattered light ahead, times the mirror's transmission; backward, the return beam and the scattered light behind, plus the scattered light ahead brought back by the mirror (c R F(R d)), times the plate's reflection.

| # | Check | Tolerance |
|---|---|---|
| R1 | Two beams on the particle in one launch (one coherence family); routes: gentle both 'beam'; tight both on the pupil route, each pass's pupil from its own lens (forward from the first, the return from the second) | must hold |
| R2 | Irradiance at the particle at each of the nine mirror steps, tight (s and p) and gentle (s) | 3 % of the reference's largest over the steps |
| R3 | Depth of the standing wave, (max - min)/(max + min) of the nine irradiances | 0.02 absolute of the reference's |
| R4 | Scattered power at each step | 3 % of the reference's largest |
| R5 | Extinction at each step | 3 % of the reference's largest |
| R6 | Change in each detector's reading (particle's light on less off) at each step, forward and backward | 3 % of the reference's largest change on that detector |
| R7 | Split detector's slope (signal over the particle's displacement across the beam) at steps 0 and 4, forward and backward | 5 % of the larger of the reference's two slopes on that detector |
| R8 | The reference's own energy: all exits (both detectors, and the light going back to the laser through the plate) add to -P_ext + P_sca | 1e-3 of P_ext |

### Results of the retro-reflected checks (after the runs)
Bench as built: plate 24 mm long at 45 deg (8 mm at first: at 45 deg it is a 5.7 mm aperture to the 1.5 mm beam, and its hard edge lowered the gentle focus's peak by (1 - exp(-a^2/w^2))^2 = 0.944; the reference has no plate edge, so the plate was made larger before the comparison counted); backward detector the lens's diameter + 3 mm; mirror 3 mm past the second lens (L = f + 3 mm).
Two errors in the reference were found and fixed before the final comparison: (1) the return was first taken as the mirror image in the focal plane, A_b(R d) = c R A_f(d); the second lens and flat mirror turn the focus through its centre (ray matrix x -> -x, a ray along d comes back along -d), A_b(-d) = c A_f(d). Even quantities (irradiance, powers, detector totals) were the same either way; the backward split signal was not. (2) none further.
Three JEKray defects found and fixed: (a) scattered light that passed through a focus on its way took no Gouy phase, so the mutual term between the light scattered back and the light scattered ahead and brought back through the focus by the mirror had the wrong sign (tight backward detector 23 % out before, 0.27 % after); fixed in fibre-face.js causticTurns. (b) a gentle beam that comes back on itself made the launch two plane waves, which sent it down the focus's wave route: each wave's whole interference was put where its single ray landed, so a split detector read the whole extinction on one half (slopes 100x too large); the wave route is now for pupil waves only (scatter.js). (c) a cone meeting a beam at a steep angle on a detector (side scatter straight onto the backward detector) summed fringes far finer than its rays (gentle backward detector 36 % out); each tube is now weighed by sinc of the phase each side runs through (fibre-face.js), which also moved N12/N13 from 0.080 % / 0.190 % to 0.013 % / 0.076 %.
R1: both foci: 2 beams on the particle, 1 launch (one coherence family); tight: routes traced, traced, pupils 2 (each beam's pupil from the mask it last passed: forward the objective, return the second lens); gentle: beam, beam. PASS.
R2 (worst over nine steps, of the reference's largest): tight s 0.10 %, p 0.10 %; gentle 1.99 %. PASS.
R3 depth: tight 0.9396 against 0.9401; gentle 0.8841 against 0.8841. PASS.
R4: tight 0.10 %; gentle 1.99 %. PASS.
R5: tight 0.19 %; gentle 2.14 %. PASS.
R6: forward tight 0.26 %, gentle 1.25 %; backward tight 0.27 % (s), 0.59 % (p polarisation not run on detectors), gentle 1.62 %. PASS.
R7: tight forward 2.1332e-2 / 5.8191e-2 against 2.1342e-2 / 5.7969e-2; backward 1.9768e-2 / 1.6449e-2 against 1.9788e-2 / 1.6055e-2 (0.1 %, 2.0 % of the larger). Gentle forward 3.5653e-4 / 2.2237e-4 against 3.5111e-4 / 2.1982e-4 (1.5 %, 0.7 %); backward step 4 4.6738e-5 against 4.7234e-5 (0.9 %); backward step 0 5.0514e-5 against 5.4149e-5: 6.7 % of the larger, FAILS, left failing (page and a todo test). Cause: the cone scattered back through the objective does not all land on the detector, so the reading integrates over the face with each ray's field carried up to 2 sqrt(dA) past the footprint's rim; the slope is a difference of two terms ten times its size. On a 20 mm detector that catches every ray: 5.4170e-5 (0.04 %). (Bounding the field to each ray's own tube was tried and broke the mirror test F1; reverted.)
The gentle focus reads 2 % above the thin-mask reference throughout: the Gaussian route is paraxial (an aplanatic lens's waist); the reference with the aplanatic rule gives 2.6037e9 W/m^2 at step 0 against JEKray's 2.604e9.
R8: FAILS, left failing and stated on the page: the reference's exits add to -P_ext + P_sca only to 38 % of P_ext (tight) and 6 % (gentle). The difference is the interference between the light scattered back and the light scattered ahead brought back by the mirror; that light reaches the sphere again and neither model scatters it a second time.

---

# Retiring the particle on a screen (written 13 Nov 2026 before the conversion existed or any run; not to be loosened)

Five saved screen-particle benches; their numbers by the old screen path (the source at 99076c0b, run headless) recorded into the test, then the same file opened by the new code (the screen converted to a screen with trap 'none' plus a Particle part) and its Particle's numbers compared:
C1 a plane wave (a wide collimated beam) on a 150 nm silica sphere; C2 the NA 0.8 focus of the example (thin-mask lens, f = 2 mm), 150 nm sphere at the focus; C3 a silica rod (cylinder, 100 nm radius, 1000 nm long, axis 90 deg in the plane) in a focus, the dipole array; C4 the NA 0.8 focus with the sphere offset (scatDx 0.2, scatDy 0.1, scatDz 0.3 um); C5 a sphere at its trap's equilibrium (scatAt 'trap') in a focus.

| # | Check | Tolerance |
|---|---|---|
| S1 | Scattering numbers: I0, Csca, Cext, Cabs, Psca, Pext, the collected share, the far field's largest value | 1e-6 relative each (2e-3 for C3's dipole array, which is iterative) |
| S2 | Where the particle is (world point) | 1e-6 mm |
| S3 | Trap figures: the three trap frequencies, the stiffnesses, the depth U | 1e-4 relative each |
| S4 | C5: the equilibrium point | 1 nm |
| S5 | Each bench opens with exactly one import note about the particle | must hold |
| S6 | Detector readings on benches that have a detector: say whether the converted Particle's scattered light changes them, with numbers (no tolerance; a statement) | - |
Validation page after the move: same case count, same pass/fail per case, gieseler the same recorded failure with the same figures (to the digits shown).

### Results of retiring the screen particle (after the runs)
Conversion: in state/elements.js loadProject (every way a bench is opened: the app, J.load, headless), a raw screen with trap 'sphere' becomes the screen with trap 'none' plus a Particle part (id <screen id>-particle, name "<screen name> particle") with every trap*/scat* setting (trapAz -> its angle; scatAt 'screen' -> 'part'; a missing trapR -> 100, the screen's old default). It starts at the screen's centre with a fromScreen marker; the first trace (placeFromScreen, before the particles' stage) moves it to where the strongest beam arriving at the screen's face ends there, at that beam's height, and drops the marker. io/open.js gives the one note; the screen's dropped trap*/scat* fields give no notes.
S1/S2/S4 (C1 to C5): every Scattering number and the place identical to the last digit (relative difference 0, place moved 0 mm), C3's dipole array included. PASS.
S3: C2, C4, C5 every trap figure identical (0); C3 identical. C1 (a plane wave: no trap either way): fx, fy 2.8e-4, fz 1.9e-4, U 2.5e-4, k 5.6e-4 relative: FAILS (1e-4), left as a todo test. Cause: with no trap the figures are taken where the search stopped, the edge of its region, and the region differs (the old screen's half length 0.1 mm; the Particle's three beam radii, capped at 2 mm).
S5: one note per file for all five, and no other. PASS.
S6: the converted Particle sends its scattered light onto the bench. Of the five test benches none has a detector. Of the examples, levitated-trap's "Detectors" reads 49.8184 mW where it read 49.6741 (+0.29 %); no other example reading moves.
Examples: three had a screen whose only job was the particle (levitated-nanoparticle, levitated-trap, optical-tweezers); the screen was removed and the Particle took its id (saved selection and views still find it). Their trap figures against the old screens: 1e-11 (two) and 1e-6 (levitated-trap's standing wave) relative.

---

# Beams that rise or descend onto a Particle (written 13 Nov 2026 before any of this was built or run; not to be loosened)

Pairs built level and rising, which must agree once the frame is turned. "Rising": the laser tipped up 30 deg (and the parts after it tipped with it), the particle on the rising axis at the same distance along it; "vertical": a level beam folded straight up by a mirror tipped 45 deg.

| # | Check | Tolerance |
|---|---|---|
| B0 | Every level example's snapshot unchanged (demos.test.mjs, no UPDATE_SNAPSHOT) | exact, as the test compares |
| B1 | beamFrame(b) of a level beam: start point, direction, axes and length equal today's level frame (x0, y0, z0 or BEAM_Z; (dx, dy, 0); (-dy, dx, 0); (0, 0, 1); len) | 1e-15 |
| B2 | Screen trap fed by a rising beam (atoms, the screenDom/trapBeams len3 bug): a screen square to a beam tipped 30 deg, at the same distance along it as a level one: depth U and the three trap frequencies against the level pair | 1e-4 relative each (a test written to fail before the fix) |
| B3 | Gentle Gaussian, level and tipped 30 deg, particle on the axis at the same distance: Csca, Cext; Psca, Pext, I0; the three trap stiffnesses; the collected share (forward cone); the far field's largest value and the field turned by the frame change at three directions | Csca/Cext 1e-9; the rest 1e-4 relative |
| B4 | Steep focus (NA 0.8 thin-mask lens), level and tipped 30 deg (laser and lens tipped together): route and pupils the same; I0, Psca, Pext, collected share, the trap's three frequencies | 1e-3 relative |
| B5 | A level fold against a 45 deg periscope mirror making a vertical beam, focused by a real glass lens turned to face up (the traced route) onto the particle above it, against the same lens level: I0, Psca, trap frequencies | 1e-3 relative |
| B6 | A detector after the particle at the rotated place (B3's pair): its reading's total and its interference term | 1e-4 relative |
| B7 | The whole validation page: same case count and the same pass/fail per case | must hold |

### Results of the rising-beam work (after the runs)
Scoping claims checked: segDir (trace.js) gives a rising leg dx, dy (in-plane unit), len (its run), uz, len3, d3 (not unit in general); legAlong maps in-plane t to len3; beamAxes matches polFrame's s (as near up); screenDom returned len3 while trapBeams built P0 = x0 + dx len, and trapShape read the legAlong-wrapped leg at a 3D length (a second stretch): all as said.
B0: the demos' snapshot unchanged through steps 1 to 6 (no update). PASS.
B1: exact (0) for every level leg. PASS.
B2: failed before the fix (rising U = 0.49 of the level one), after: PASS.
B3: Csca, Cext 0; Psca, Pext, I0, collected share 4e-16; far field largest 4.8e-8, turned 1.2e-8; stiffness across 1.1e-8, along 2.7e-7; stiffness up 1.2e-4: FAILS (1e-4), left as a todo test. No trap in this gentle beam (radiation pressure wins, the search runs away 59.5 mm along it); in the rising frame the search ends 2.7 nm above the axis where the level one ends on it. Not found further.
B4: route traced, pupils 1 both; I0, Psca, Pext 8.3e-4, collected share 1.3e-5, fx 9.5e-4, fy 8.1e-4: PASS; fz 1.13e-3: FAILS (1e-3), left as a todo test. The tipped thin mask's focus is built by the surface-frame trace (popScreen3) where the level one takes the plane route. Giving the traced pupil 3D polarisation axes (as field2d does) changed nothing here.
B5: NOT DONE (the periscope with a real lens facing up).
B6: total 2.2e-14, interference 4.8e-8, own 1.6e-8. PASS.

### Results of the round on the open failures (13 Nov 2026)
1 B4: cause: a round beam's field was read by a straight line between its 256 radial samples in a steep focus's pupil (vfPupil); the tipped focus is carried as a 2D field and was right. Against the thin-mask reference (scatter_position_focus.py, 6.99448e10 W/m^2): level +2.364e-3, tipped +1.535e-3; level with the 2D field +1.535e-3; level on a 512 grid +1.934e-3. Fixed: the series. Level +1.537e-3, tipped +1.535e-3; B4 fz 1.13e-3 -> 8e-6, I0 8.3e-4 -> 2.3e-6. PASS.
2 B3: cause: the rising frame's points went through world coordinates 80 mm out; rounding 1e-14 mm against a gentle beam's radiation pressure (no trap, the search runs 60 mm) left the search 2.7 nm off axis. Fixed: the strongest beam's own field at (x, y, len + z). Search ends at (0, 0); stiffnesses 5e-9. PASS.
3 No-trap figures: decided not to give them (no trap: the search's end is the edge of its region; the tab never showed them). Test changed to check none are given.
4 G9: fixed (footprint-weighted transmission). 0.849 -> 0.829 against 0.834 (-0.6 %). PASS. Examples moved: optical-tweezers 2.4 %, RF lenses up to 0.8 %, others <= 0.1 %.
5 Retro gentle backward slope: cause: a third cone (side scatter straight onto the detector past the 12 mm objective), outside the reference's geometry; the rim of the face integral was not the cause (bounding it moved the slope 0.2 %). With a stop the lens's size: -1.46 % on 15 mm and 20 mm detectors alike. PASS.
6 R8: the gap is the returned scattered light's extinction (equal to the cross term to rounding) plus a 3.6 % quadrature residual of the reference (the own power outside the cones on the sphere grid cut at the cones' edge). Iterating the sphere driven by its own returned light (4 passes, converged to 1e-6) takes the gap from -15.5 %, +38.5 %, -22.4 % of P_ext (steps 0, 3, 7) to 3.6 % at all three; it moves P_sca by +2.3 %, +0.08 %, -0.38 %. R8 still FAILS (1e-3): JEKray does not re-scatter (left out on purpose), and the reference's quadrature leaves 3.6 %.
7 B5: built; route traced both; I0, Psca 3.3e-4, frequencies across 2.0e-4, 3.5e-4, along 6.8e-4 (1e-3). PASS (a 100 nm sphere: the 300 nm one is not held at NA 0.5 in vacuum).
8 Labels: done.

---

# Second scattering of returned light (written 13 Nov 2026 before it was run; not to be loosened)

JEKray: the particle driven also by its own scattered light that a retro-reflector brings back, iterated until the returned light changes by less than 1e-7 (relative, RMS over the returning cone) or 12 passes. Reference: scatter_retro.py with the same iteration (A_ret(-d) = (i c / lambda) F(d) exp(-2ik d.r_s)), run to the same tolerance.

| # | Check | Tolerance |
|---|---|---|
| T1 | Scattered power and extinction at each of the nine mirror steps, tight and gentle, against the reference with second scattering | 3 % of the reference's largest |
| T2 | Each detector's change at each step, forward and backward | 3 % of the reference's largest on that detector |
| T3 | Split slopes at steps 0 and 4, forward and backward | 5 % of the larger of the two |
| T4 | JEKray's iteration converges (below 1e-7) within the cap on both retro benches at every step | must hold |
| T5 | The reference's own energy (R8) with second scattering: all exits against -P_ext + P_sca | 1e-3 of P_ext (report before and after, and with a finer sphere grid) |
| T6 | Examples' snapshot: unchanged except where an example has light returning to a particle (each listed with why) | exact otherwise |
| T7 | Cavity: a particle between two mirrors facing each other is flagged 'cavity' (one pass, no iteration); the retro trap is not | must hold |
| T8 | Retrace time on the retro bench and on the scattering example, with and without: reported (the example must not cost more: within 10 % or 2 ms) | report; example within 10 % |

### Results of second scattering (after the runs)
T1-T3 (Node test, steps 0 and 3 / 0 and 4; and the validation page's retro case at all nine steps, which passes): tight I0 2e-3, dF 2.4e-3/6.9e-3, dB 1.2e-3/1.6e-2 (of their own values, all well within 3 % of the largest); slopes tight F 2.1334e-2/5.7471e-2 against 2.1378e-2/5.7319e-2, B 1.9429e-2/1.6838e-2 against 1.9508e-2/1.6397e-2; gentle F 3.5756e-4/2.2197e-4 against 3.5212e-4/2.1946e-4, B 5.3080e-5/4.6712e-5 against 5.3819e-5/4.7598e-5. PASS.
T4: JEKray converges in 4 passes (tight, change 2.9e-8) and 3 (gentle, 1.9e-8). PASS.
T5: reference energy with second scattering: tight 38.5 % -> 3.6 %, gentle 6.0 % -> 0.97 % (48 x 96 sphere grid); on a 96 x 192 grid tight 8.6e-4, 5.5e-4, 2.1e-3 (steps 0, 3, 7): the 3.6 % is the sphere grid's quadrature of the scattered power outside both cones (the grid's rings cut at the cones' edges). Still FAILS 1e-3 at step 7 on 96 x 192; the stored reference keeps the 48 x 96 grid.
T6: no example's snapshot moves. levitated-trap's two arms from one laser were first taken as a return (and flagged a cavity); the return now has to be light the going beam itself became, and it is not.
T7: two mirrors facing each other: flagged 'cavity', one pass; the retro trap is not. PASS.
T8: retro bench (tight): the scattering run 1.68 s -> 2.69 s; the retrace with the answer kept 44 -> 42 ms. Scattering example: run 800 -> 680 ms, retrace 25 -> 23 ms (noise; no return there). PASS.
JEKray's change on the retro benches: P_sca +2.5 % (tight step 0, 2.737e-5 -> 2.806e-5), +0.14 % (step 3), +0.28 % (step 7); gentle +2.5 %, +1.5 %, +2.6 %.

---

# Second scattering for the dipole array and the single dipole (written 13 Nov 2026 before it was run; not to be loosened)

| # | Check | Tolerance |
|---|---|---|
| U1 | The 300 nm silica sphere run as a dipole array in the tight retro trap, steps 0, 3 and 7: scattered power and extinction against the same sphere by Mie with second scattering | 2 % each (what the dipole array meets against Mie without it) |
| U2 | The silica rod (200 nm across, 1 um long, its axis across the beam in the plane) in the retro trap, tight and gentle, nine mirror steps, against an independent dipole array in scatter_retro.py (its own lattice, the lattice dispersion relation, its own solver; iterated the same way): scattered power and extinction | 3 % of the reference's largest |
| U3 | The same: each detector's change | 3 % of the reference's largest on that detector |
| U4 | The same: split slopes at steps 0 and 4 | 5 % of the larger of the two |
| U5 | The dipole array converges in its returns (below 1e-7) within the cap; the BiCGStab iterations of each pass reported | must hold; report |
| U6 | The single dipole in the retro trap: second scattering applied (passes reported) | must hold |
| U7 | A rod between two mirrors facing each other is flagged 'cavity' | must hold |
| U8 | No example's snapshot moves unless it has returning light | exact otherwise |

### Results of second scattering for the dipole array and the single dipole (after the runs)
U1: dipole-array sphere against Mie (both with second scattering), tight, steps 0/3/7: P_sca 1.13e-2, 1.25e-2, 6.1e-3; P_ext the same. PASS (2 %).
U2-U4 (validation page, nine steps, tight and gentle; Node test at two steps and the slopes): passes. Node: P_sca/P_ext tight 2.5e-4, 5.2e-4 of the largest, gentle 1.8e-2, 8.9e-3; slopes tight F 2.7460e-2/7.8950e-2 against 2.7465e-2/7.8835e-2, B 2.8120e-2/2.2070e-2 against 2.8594e-2/2.1309e-2 (1.7 %, 3.6 % of the larger); gentle F 7.1405e-4/4.2221e-4 against 6.9716e-4/4.1266e-4, B 1.3110e-4/1.0416e-4 against 1.3091e-4/1.0503e-4. The reference's rod first had the nominal 20 nm spacing (Csca 3.1 % above JEKray's); with the spacing that gives the dipoles the rod's own volume (N d^3 = V, the standard convention, which JEKray uses) it agrees to 5e-7 on a plane wave.
U5: converges: tight 4 passes (BiCGStab 3, 2, 1, 0 iterations, each pass started from the last answer), gentle 3 (3, 1, 0); the sphere array 3 (3, 1, 0). PASS.
U6: the single dipole returns and converges. PASS.
U7: a rod between two mirrors: flagged, one pass. PASS.
U8: no example's snapshot moves. PASS.
Validation page: 62 of 63 cases (1943 of 1946 checks); only gieseler fails, unchanged.

---

# A particle inside a non-degenerate cavity, solved directly (written 14 Nov 2026 before any of it was built or run; not to be loosened)

Bench: a two-mirror Fabry-Perot (both mirrors concave, R = 25 mm, 10 mm apart, reflect 90 %, transmit 10 %: g = 0.6, round-trip Gouy phase 2 acos(0.6) = 1.855 rad, 0.295 of 2 pi, finesse about 30), 1550 nm laser locked to it, a silica sphere inside: at an antinode on the axis, at a node, a quarter of the way between, and off the axis by 0.3 of the mode radius (an antinode along the axis). The particle's radius 50 nm (the single dipole), 150 nm (Mie and the dipole array).
Reference: a Python Fabry-Perot written here, sharing no JEKray code: the cavity's HG_mn modes from its own q and Gouy phase, the input beam's overlap with each, the particle's coupling by its polarisability (dipole) or its Mie far field projected on each mode (both directions of the standing wave), and the self-consistent mode amplitudes a = (I - D(delta) K)^-1 a_drive; checked first against the classical formulas.
Mode-keeping threshold (fixed now): keep HG_mn while |u_mn(r_p)|^2 / max over the mode of |u_00|^2 times its resonant enhancement |1/(1 - lambda_mn e^{i delta})|^2 at the lock exceeds 1e-6 of the TEM00's, up to m + n = 12.
Degeneracy criterion (fixed now): a cavity is degenerate when the round-trip Gouy phase (each axis) is within 3 linewidths (3 x 2 pi / finesse) of 2 pi p / q for some q <= 6 (confocal: 1/2, concentric: 0 or 1, and the like); then the warning stays.

| # | Check | Tolerance |
|---|---|---|
| V0 | The reference against the classical formulas, the dipole at an antinode on the axis: the cavity's resonance shift (from Re alpha and the mode field squared there) and its extra linewidth (from Im alpha: scattering into free space) | 1 % each |
| V1 | The same at a node: shift and extra linewidth zero | below 1e-3 of the antinode's |
| V2 | JEKray against the reference: resonance shift, at the four places, each model | 5 % of the antinode's value |
| V3 | Extra linewidth, the same | 5 % of the antinode's value |
| V4 | Transmitted and reflected power over a detuning scan across the resonance (41 points over three linewidths), each place | 2 % of the peak transmitted power |
| V5 | Scattered power, each place | 3 % of the antinode's |
| V6 | Modes kept at the four places, reported (on the axis: TEM00 only by symmetry for the antinode/node/quarter; off the axis: the count) | report |
| V7 | A degenerate cavity (confocal: R = L) keeps the warning; the test cavity does not | must hold |
| V8 | Every bench without a particle in a cavity: the examples' snapshot unchanged | exact |
| V9 | Cost: the scattering run and the retrace with the particle against the empty cavity | report |
| V10 | The whole validation page: same case count and pass/fail plus the new case | must hold |

## Results: a particle inside a non-degenerate cavity (14 Nov 2026)

- Reference bug found and fixed before any comparison was trusted: the input beam's curvature had the wrong sign (overlap 0.827 instead of Kogelnik's closed form 0.98327, now asserted in the script).
- V0: reference vs Bethe-Schwinger shift 7.1e-4, widening 7.9e-4 (tol 1e-2). PASS.
- V1: node/antinode shift 0, widening 2.2e-7 (tol 1e-3). PASS.
- V2/V3 (degeneracy test off), relative to each place's own value: dipole 5e-5..1.4e-3, Mie 5e-5..1.9e-3, dipole array 0.6%..4.6% (worst at the node, relative to the node's own; against the antinode's under 1.3%). PASS (5% of the antinode's).
- V4: all 41 points x 4 places x (through, back) plus the empty cavity within 2% of peak (worst 2.4e-4 mW of 0.983). PASS. The particle's change through agrees to about 1%. The change at the back port at resonance is 2.3e-7 against 6.2e-7: a first-order projection on a reading that nearly cancels.
- V5: scattered power within 5e-5 (Mie, dipole) and 1.2-3.8% (array; under 1.3% of the antinode's). PASS. The validation page's bench has a 50/50 plate, so it compares twice JEKray's value (half the laser reaches the cavity); the first page run compared without the factor and failed by exactly 2.
- V6: modes kept 28 on the axis, 48 off it, the same as the reference; 7 at finesse 3000.
- V7: FAILS as fixed. Confocal keeps the warning, but so does the test cavity: its Gouy phase of 1.855 rad is 0.240 rad from 2 pi/3, inside 3 x 2 pi/29.8 = 0.633. Left visible; the solve was compared with the test switched off (setCavDegenCheck / J.cavDegenCheck).
- V8: demos snapshot unchanged (54/54).
- V9: empty cavity retrace 11 ms, readings 3 ms. With a particle, retrace about 0.32 s (cones); the scattering run 2.6 s (Mie, of which the cavity part 0.87 s: the projection), 2.7 s (dipole, 0.92), 3.0 s (array, 1.04), against 2.0 s for the old warned single pass.
- V10: see the report.
- V10: whole page 62 of 64 cases, 2394 of 2398 checks; the failures are the Gieseler gas-damping case (3 checks, open before this work) and V7 here. A first full-page run had the scan read the lock at every point (it took another case's cavity id); fixed in the page.

---

# A particle inside a degenerate cavity, solved in the pupil basis (written 14 Nov 2026 before any of it was built or run; not to be changed without asking)

Benches (1550 nm, 1 mW laser, its waist 20 um at the cavity's centre, silica sphere, radius 50 nm as the single dipole and 150 nm by Mie and the dipole array; mirrors 90 % / 10 %, aperture 5 mm across):
- C: concentric, R = 10 mm, mirrors 20 mm apart (their centres of curvature at the middle); the particle at the centre, and off it along the axis and across by 0.2 um.
- C-near: the same with the far mirror moved in by 2, 10 and 50 um (near-degenerate: the returns drift).
- F: confocal, R = 20 mm, 20 mm apart; the particle at the centre (returns every round trip) and off the axis across by 2 um in the focal plane (returns every second round trip).
- S: the stage-2 non-degenerate cavity (R = 25 mm, 10 mm apart) for the cross-check with the mode solve.

Reference (Python, no JEKray code): the particle's emission as directions over each mirror's cap; for the ideal concentric and confocal the returned field at the particle summed in closed form as the geometric series of its re-images (factor -(i/lambda) prod(r) e^{ik l} times -1 for each intermediate focus, per return), the dipole self-consistent p = alpha E0 / (1 - alpha beta); the Mie sphere by the same series in the plane-wave basis solved numerically. Checked first against a closed form: for the dipole at the centre of the concentric cavity, the change of its total emitted power against the free dipole equals the cap-weighted Airy factor, (P - P0)/P0 = (3/(8 pi)) Re[(Phi/ (k-independent)) ...] written out in the script from the dipole pattern over the caps and the series sum S = c / (1 - c).

Heinzen, Childs, Thomas and Feld, PRL 58, 1320 (1987): only the abstract could be read here (factor 19 enhancement and 42 inhibition of the partial rate into the confocal resonator's modes; 1.6 % rise and 0.5 % fall of the total rate). Their resonator's parameters could not be confirmed (the journal's site is not reachable from this session), so it is not used as a check.

| # | Check | Tolerance |
|---|---|---|
| D0 | Reference against its closed form (dipole, concentric, centre): the change of total emitted power | 1e-3 relative |
| D1 | JEKray against the reference, concentric, centre, each model: the field at the particle with the returns (|E_tot|^2 / |E0|^2) | 2 % of the reference's change from 1 |
| D2 | The same: scattered power and extinction | 3 % of the reference's value |
| D3 | The detectors behind each mirror, the particle's change in the reading, concentric centre (Mie) | 10 % of the reference's change |
| D4 | Confocal, centre and 2 um off axis: as D1 and D2 | as D1, D2 |
| D5 | Near-degenerate concentric (2, 10, 50 um): as D1 (the returns' dephasing) | 5 % of the reference's change from 1 |
| D6 | Cross-check on cavity S: the pupil solve's scattered power and the field at the particle against the stage-2 mode solve | 3 % of the mode solve's change from the empty cavity's |
| D7 | Benches without a particle in a cavity: the examples' snapshot | exact |
| D8 | Cost against the empty cavity and against the mode solve | report |
| D9 | Fresnel number: a cavity whose N = a^2 / (lambda L) is under 10 gets the small-Fresnel-number note on the Scattering tab | must hold |
| D10 | The whole validation page and both suites | must hold |

## Results: degenerate cavity, pupil solve (14 Nov 2026, first pass)

- D0: ray-traced series vs closed form, ideal concentric dipole: 1.8e-4 (tol 1e-3). PASS. Fixed dipole's emission x2.693 (series) vs x2.694 (closed form). Two reference bugs found and fixed before comparing: mirror index double-step in one trace step; missing Gouy pi per intermediate focus.
- D1 (field with returns, 2% of change): concentric centre dipole 6e-4, Mie 5.2e-3, DDA 1.1e-2; along 1.2e-3; across 3.3e-3; confocal centre dipole 7.9e-4, Mie 6.3e-3. PASS.
- D2 (Psca, Pext, 3%): all cases within 1.2e-2 (DDA), the rest under 1e-4. PASS.
- D3 (through detector, 10% of change): confocal Mie -5.58e-5 vs -5.57e-5 PASS. Concentric FAILS: dipole -1.58e-5 vs -1.04e-5; Mie -5.63e-4 vs -4.13e-4. JEKray's empty concentric itself transmits 0.633 instead of ~1 (its trace legs' waists drift: qr -9.87, -9.76 ... per bounce), so the beam the change is projected on is not the reference's ideal one. Behind-M1 detector not compared.
- D4 (confocal 2 um off axis): Mie E2 change 1.0e-2 PASS, Psca 1.4e-5 PASS; dipole E2 change 31% FAIL (the change is -2.3e-6, absolute difference 7e-7), Psca 7e-7 PASS.
- D5 (near-degenerate, 5% of change): 2 um 3.4% PASS; 10 um 11.8% FAIL; 50 um 12% FAIL (grid 128 instead of 64: 8.6%; bilinear landing of drifting returns diffuses them over ~1000 passes).
- D6: not done as written. Cavity S never re-images the particle, so the pupil solve does not apply to it. Near-concentric (50 um) is not a fair substitute either, because the mode solve keeps only m+n <= 12.
- D7: demos snapshot 54/54 unchanged.
- D8: pupil part 0.3-0.6 s (dipole), 8-10 s (Mie, 6192 directions), 1.5 s (array); scatter runs 2.2-15 s against 2.0 s before (warned single pass). GMRES 1-3 iterations; the empty cavity's return series 300-1550 sparse terms (grows with the finesse, cheap).
- D9: the Fresnel note is wired ('fresnel' flag at N < 10; these benches have N = 202); no small-N bench run yet.
- Heinzen et al. 1987: only the abstract was reachable (link.aps.org blocked); not used.

---

# Round 2, item 1: the empty concentric cavity (written 14 Nov 2026 before the reference script was written or run)

Disclosure: before writing this I did a ten-line check of the paraxial series below (the Gaussian's curvature growing by 4/R each round trip), which gave a peak of 0.633. The expectation and the tolerance are written knowing that number.

Expectation: an exactly concentric cavity is not the identity for a beam. Its half trip is [[-1, 0], [-2/R, -1]], and its round trip is [[1, 0], [4/R, 1]], a shear: the centre point images onto itself, but a wavefront flat at the centre comes back curved (Petzval field curvature). A Gaussian with its waist at the centre is therefore not an eigenmode. The terms of the steady state lose overlap, and the transmission falls below 1. If so, JEKray's 0.633 is the physics, not a fault.

Independent check (Python, shares no code; `validation/scripts/concentric_empty.py`):
- (a) The paraxial Gaussian series in closed form: overlaps 1/(1 + i k w0^2 (n - m)/R).
- (b) A Fox-Li round trip of the field, radial: Fresnel-Hankel integrals from the centre plane to the mirror, the mirror's exact sag, and back; the steady state as the sum of round trips.

Both at exact concentric and 10 um short of it (stable, with its own Gaussian mode).

| # | Check | Tolerance |
|---|---|---|
| E1 | (a) against (b), peak transmission | 1 % |
| E2 | JEKray's locked transmission, concentric and 10 um short, against (b) | 1 % |
| E3 | If E2 holds there is no fault, and no empty-cavity code is changed | must hold |
| E4 | D3 re-run: the reference's empty forward wave becomes this series (not one Gaussian), and JEKray's projection uses each leg's actual field at the particle | the original D3 tolerance (10 % of the change) |

## Results, round 2 item 1
- E1: the Fox-Li run with the paraxial sag agrees with the series: 0.63295 against 0.63295. PASS.
  The first Fox-Li run used the sphere's exact sag with the paraxial propagator and gave 0.570. That mixes two approximations; the sag is now paraxial, as the docstring says. Recorded here, not hidden.
- E2: JEKray locked, through power (1 mW in):
  - concentric: round engine 0.63283, 2D engine 0.63121, against 0.63295. PASS.
  - 10 um short: round engine 0.74184, 2D engine 0.74057, against 0.74190. PASS.
  - Also 2 um short 0.6438 and 50 um short 0.9470 (JEKray only).
- E3: no fault, so no empty-cavity code was changed. The 0.633 is the concentric shear (round trip [[1,0],[4/R,1]]), and the trace's q drift per bounce is that physics.

## Round 2, items 2-4 (14 Nov 2026)

Item 2, near-degenerate drift.
- The bilinear landing each pass is replaced by exact chains (pupChains). Each grid direction is followed ray by ray through all its returns, until 1e-9; each return is landed on the grid once, keeping its value at the particle.
- The chains run to about 2.3e6 returns, in 6-8 s.
- Second finding: the lock. For an exactly concentric cavity the steady state's Ritz value is wrong, because its round trip is a shear with no mode. The lock is now taken from the empty light itself (lam = leg / f). It agrees with the reference's power-lock to 0.002 rad.
- For stable near-degenerate cavities the lock is the TEM00 Ritz value times e^{i(Gx+Gy)/2}, the ray's own round trip.
- This changed all the concentric results; the reference inputs were regenerated.
- D5: 2 um 3.7e-4, 10 um 7.6e-3, 50 um 1.5e-3 (tolerance 5e-2). PASS.

Item 3, D4 (dipole 2 um off axis, confocal).
- Cause: the hard rims as a staircase of whole grid cells. The quadrature error is first order in the cell size, and the off-axis change is a near-cancellation of the two images' returns (net -2.8e-6), so a ~1 % error in either becomes 30 % of the change.
- The reference moved too (-2.876e-6, -2.834e-6, -2.795e-6 at grids 151, 301, 451).
- Fix in both codes, independently: rim cells sub-sampled 4 x 4 (5 x 5 in the reference) and traced; weight = the share that returns, direction = their mean.
- After the fix: reference -2.822e-6 (151), -2.796e-6 (301); JEKray -2.749e-6 (48), -2.785e-6 (64), -2.774e-6 (96).
- The final D4 numbers come from the regenerated reference (below).

Item 4, the bench tracer. STOPPED to report, as asked.
- Tracer throughput measured: 7.0e4 to 8.9e4 ray segments per second (501 rays in a concentric pair, 20, 60 and 200 bounces: 286, 747 and 1908 ms).
- The chains need 1.1e6 to 2.4e6 returns per solve: 15 to 35 s of tracing, against 6-8 s now.
- The tracer runs only inside traceScene (runSources is local to it). A scatter run, whether in the page's worker or sync, cannot call it.
- Feasible design: a trace-phase probe, as scatter-light's PROBES do. It traces the 6064 grid directions for one pass (pattern reflections: about 12e3 segments, about 0.15 s), keyed by geometry. It records each ray's direction, point, optical path, and Jones amplitudes with the coatings. The scatter run reads that one-pass map, and the chains run on the map interpolated (smooth: d -> d', phi, image, M).
- That is the tracer for the geometry and coatings, with interpolation for the many returns. Waiting for a decision before building it.

D6 proposal (not run): a fair cross-check of the pupil solve against the mode solve needs a cavity where both apply.
- The pupil solve needs re-imaging; the mode solve needs the particle's light held within m+n <= 12.
- Candidate: near-concentric 50 um short with 1 mm mirror apertures. The cap is 0.1 rad, about 3 mode divergences, and the Fresnel number is 8 (it would carry the note).
- Tolerance proposed: the field with the returns within 5 % of the change.

## D6 (written 14 Nov 2026 before the run, as approved)
Bench: near-concentric, the far mirror 50 um in (R = 10 mm), mirrors 90 %, apertures 1 mm across (cap about 0.1 rad, Fresnel number 8: the note shows). Single dipole 50 nm at the centre. The pupil solve against the stage-2 mode solve (the degeneracy test off for it), both JEKray. Check: the field at the particle with its returns, |E|^2/|E0|^2 - 1, within 5 % of the mode solve's change. Also the scattered power, within 3 %.

## The switch to the bench tracer's one-pass map (D-checks before -> after; reference regenerated with its rim cells)
Each entry: the field-with-returns change, off by (relative to the reference's change).
- Concentric centre: dipole 7.4e-4 -> 3.3e-4; Mie 5.1e-3 -> 6.1e-3; dipole array 9.8e-3 -> 1.1e-2 (tolerance 2e-2).
- Concentric, particle along / across the axis: 5.4e-4 / 4.8e-4 -> 6.6e-4 / 2.0e-3.
- Near-degenerate (tolerance 5e-2): 2 um 2.7e-4 -> 1.2e-2; 10 um 1.4e-2 -> 3.0e-2; 50 um 1.35e-2 -> 9.8e-3.
- Confocal centre: dipole 9.2e-4 -> 1.3e-4; Mie 6.4e-3 -> 7.2e-3.
- Confocal 2 um off axis (D4): dipole 3.9e-3 -> 3.2e-1, FAIL after the switch; Mie 2.4e-2 FAIL -> 7.2e-3 PASS. The dipole's change is -2.8e-6, a near cancellation of its two images' returns; the map's 64 grid and its 96 grid give the same 0.32, so the error is in how the map carries a return that crosses beside the particle (first order in its offset, the path to second order), not the grid. Not resolved.
- D2, the scattered power: all within 3e-5, except the dipole array at 1.26e-2.
- Getting there needed three fixes:
  - the grid reaching past the rim estimate (it had cut a sliver: 1.25 % at concentric);
  - Catmull-Rom between cells;
  - the path's second order in the offset (10 um was 55 % without it).
- D3 (detector behind the far mirror, tolerance 10 % of the change): concentric dipole 2.35e-5 against 2.27e-5 (3.6 %) PASS; confocal Mie -5.61e-5 against -5.60e-5 PASS; concentric Mie 6.20e-4 against 7.30e-4 (15 %) FAIL. The reference's Mie through-beam projection is on its 41-point grid; its convergence there is not checked.
- D6 as proposed cannot run: the mode solve calls the 1 mm mirrors clipped (rim within 3 mode radii, w = 0.31 mm there). The pupil solve gives E2 - 1 = 1.88e-5, with the Fresnel note.
- D9: mirrors 0.3 mm across, Fresnel number 0.73: the 'fresnel' note shows. PASS.
- The detector in front (the plate's return port), concentric Mie: change +2.87e-4 of its reading. There is no independent reference for it yet.
- Cost, concentric Mie, 28 s in all:
  - the chains, about 14.5 s (2.47e6 returns, each a 4 x 4 Catmull-Rom of the map);
  - the GMRES responses, 4 Mie far fields of 6192 x 6192 waves, about 6 s;
  - the far-field pattern and cuts with 6192 extra waves, about 5 s;
  - the probe trace, about 1 s, kept while the geometry stays.
  - Could come down: the chains cached by geometry and lock (they do not depend on the particle); the Mie answer and pattern through its multipole coefficients (rank about 2 n (n + 2), n about 4) instead of wave by wave.

## Round 3 (14-15 Nov 2026). No tolerance changed.

### D4, the particle 2 um off a confocal cavity's axis (tolerance 2 %)
The traced map against the retired mirror code (exact rays on the two paraboloids), direction by direction, three returns each (5464 directions):
- First return: direction, crossing and path agree to rounding (1e-15, 3e-14 mm, 2e-14 mm) away from the rim. In the rim cells the map was held level across missing cells: direction 5.4e-3, phase 8.6e-2 rad.
- Second return (it starts from the image, 4 um across the axis): crossing 3.2e-7 mm, phase 2.6e-4 rad, growing with the direction's angle. The expansion about the particle stopped at first order for where the ray lands and which way it goes.
- The field matrix agrees on every field square to the ray; along the ray the tracer's has nothing, the law's 0.9 (no light is polarised that way).
Fixed in the map: where the ray lands and its way to second order in the offset (the offsets' second differences, no new rays); the phase from Hamilton's rule, d(ell - d'.q') = -d.dq - q'.dd', to third order; the rim cells by a least-squares surface of second degree through the cells that bring light back.
After: away from the rim, direction 3.6e-11, phase 3.5e-10 rad; in the rim cells, direction 5.1e-5, phase 2.1e-4 rad; crossing 8.1e-11 mm everywhere.
- Dipole: 0.32 -> 1.21e-2. PASS.
- Mie: 7.2e-3 -> 2.52e-2 against the reference as it was (it had been 2.4e-2 before the switch too). The reference was the one out: its Mie case applied the first return's map again and again, which is not the second return for a particle off the axis. With every return traced as its own ray (as its dipole always was), the reference's change is -1.400626e-3 (was -1.369936e-3, 2.2 % out); on the axis it does not move (1e-8). Its grid: 31 -> -1.398652e-3, 41 -> -1.400626e-3. JEKray against it: 2.75e-3. PASS.

### D3, the detector behind the far mirror (tolerance 10 % of the change)
- The reference's Mie grid, concentric: 31 points 7.3095e-4, 41 points 7.3048e-4, 61 points 7.2993e-4. Converged to 0.15 %: the reference does not move.
- JEKray's side: the solve's forward change was taken as one factor on the loop's leg by projecting on that leg's own spectrum. In a concentric cavity each pass has its own shape, and the detector reads the loop's light and the first pass together. The factor is now the one that changes the power of all the forward light as the change does. Concentric Mie 6.19e-4 -> 7.280e-4 against 7.305e-4 (-0.35 %). PASS. Confocal Mie -5.613e-5 against -5.601e-5 (0.2 %), confocal dipole -3.8910e-7 against -3.8911e-7: unmoved.
- The reference's dipole took its overlap within 0.15 rad of the axis. A concentric cavity's beam fills the cap: over the whole cap it gives 2.7110e-5, not 2.2665e-5 (301 and 601 points agree to 6 digits within 0.15 rad). JEKray 2.7042e-5 (-0.25 %). PASS. The earlier 3.6 % was two errors of about 19 % each way.

### Cost, concentric cavity, 150 nm sphere by Mie
Before: 28 s every solve (chains 14.5 s, Mie answers 6 s, pattern 5 s, probe 1 s).
After: the first solve 22 s; a solve with the cavity as it was 6.0 to 6.5 s (the answer the same to all 9 digits printed).
- Kept with the map: the chains (9 to 10 s), the legs' spectra (4 s).
- Cut: one Mie answer GMRES asked for from nothing, the answer to the solution (the solve's own sum), the far field along the returned waves (the solve's own).
- What is left in a re-solve: two Mie answers of 5656 x 5656 waves in GMRES (2.2 s), the pattern and totals with 5656 more waves (3 s).

### The probe on other benches
traceScene, least of 15, before the probe (c0b5d2f1) and now, two runs each (ms): michelson 3.5/3.5 -> 3.5/3.7; fabry-perot 3.6/3.6 -> 3.7/3.9; optical-tweezers 16.2/16.1 -> 16.8/15.8; scattering-sphere 16.9/16.6 -> 16.5/15.5; levitated-trap 93.6/91.3 -> 91.7/91.4. No difference beyond the runs' own spread.

### D6
Not possible as written, and not fairly possible another way:
- 1 mm mirrors: the mode there is 0.31 mm in radius, the rim 1.6 of them: the mode solve refuses it as clipped (it wants 3).
- 5 mm mirrors at 90 %: the mode solve refuses it as degenerate; that is why the pupil solve exists.
- 5 mm mirrors at 99 %, 50 um short: not degenerate by the test (the next order is 9.5 linewidths off), so the mode solve takes it; the pupil solve made to take it too (a switch in a copy of the sources). The change of |E|^2 at the particle: mode solve (28 modes kept) -1.07e-4; pupil solve (2.36e7 returns, 147 s) +9.1e-5. They do not measure the same thing: the mode solve keeps the modes near resonance, and in a near-concentric cavity the light that comes back off resonance, re-imaged, is as large. Neither is the other's reference.
Proposal for the owner: drop D6. D5 already checks the near-degenerate tracking against the independent ray reference (2, 10, 50 um short: 6.8e-4, 2.6e-2, 5.0e-3, tolerance 5e-2).

## Round 4 (written 15 Nov 2026 before any run)
Case "concentric-50um-99": two mirrors R = 10 mm, 5 mm across, 99 % (1 % through), the far one 50 um in; laser 1550 nm, 20 um waist at the middle; single dipole, silica, 50 nm, at the particle's place in the bench (x = -0.025 mm, the cavity's middle).
Quantity: the change of |E|^2 at the particle from the empty cavity's, E2 - 1.
- A match: JEKray's change within 5 % of the reference's change (as D5, the other short-of-concentric cases). Fixed now, not to be changed after the runs.
- The reference's own convergence is to be shown first (returns followed, the grid of directions): it counts as converged for this purpose if doubling either moves its change by under 1 % (a fifth of the tolerance). If it does not converge to that, it decides nothing and that is the result.
- The three numbers (reference, mode solve, pupil solve made to run) are to be at the same lock: the reference takes the bench's own lock (lam, h2, f, b from JEKray's empty cavity, as its other cases do), and the mode solve's and the pupil solve's detuning are to be reported and compared with it before the changes are compared.

### Round 4, what the runs gave (15 Nov 2026). The 5 % and the 1 % written above were not changed.
Bench: 99 %, 5 mm mirrors, 50 um short, dipole at the cavity's middle. Lock: the same for all three (dLock -0.2052819 in the mode solve and the pupil solve; TEM00's round trip 0.9900137, phase -7e-9; the ray's round trip phase -0.200083 = the round trip's Gouy phase; the reference takes h2 and lam from the bench).
- Mode solve (28 modes, what JEKray uses): E2 - 1 = -1.068e-4.
- Pupil solve made to run (2.36e7 returns): +9.119e-5.
- Reference as written: grid 64 / 101 / 151 / 201 / 301 -> -1.529 / -1.778 / -1.923 / -1.936 / -1.960 e-5; returns 1000 / 2000 / 4124 (faded) -> -1.500 / -1.777 / -1.778 e-5. 151 -> 301 moves it 1.9 %: over the 1 % written, so by the rule it is not converged. Its imaginary part is -7.4e-6.
- No match: neither JEKray number is within 5 % of it, or within a factor of 4.
The reference itself is wrong here, and so is the pupil solve, the same way: a return is put down as A dOmega' = F dOmega, the same solid angle back as out. True where the cavity re-images exactly. Short of that the n-th return's directions are spread, d' = D_n u (D_n = (-1)^n cos(0.1 n) here: -0.995, +0.980, ... 0 at n = 15), and the field at the particle needs the weight -sqrt(D_mer) sqrt(D_sag) in place of (-1)^(n-1) (energy: |A|^2 dOmega' = |F|^2 dOmega; for a point source in a paraxial system it gives e^{ikL}/(i lambda B_n), without it that over D_n).
- Shown: with the weight the reference's alpha B has imaginary part +7.90e-4 to +8.03e-4 (grids 64 to 201); a paraxial count mode by mode (LG_p0, each with its resonance factor) gives +8.05e-4, TEM00 alone +8.69e-4. As written: -7.4e-6. The resonance is not in the ray sum without the weight.
- With the weight, E2 - 1 at 99 %: grid 64 / 101 / 151 / 201 -> +0.04 / -0.58 / -1.17 / -1.94 e-5. Not converged: it is the real part, 1 % of the imaginary. The mode-by-mode count to the rim swings with where the rim cuts: -2.4e-5, +8.4e-5, +1.1e-5, -1.6e-5 for orders to 60, 62, 64, 66; to order 6 (the mode solve's) -8.1e-5, to 12 -1.06e-4, to 20 to 40 -1.2e-4.
- What the weight does to the validated cases (reference, grid 101; 201 for the short ones): concentric, confocal on axis: nothing (D = +-1). Concentric along / across: -0.07 % / -0.02 %. Confocal 2 um across, dipole: -2.811e-6 -> -3.391e-6 (+21 %). 2 um short: -3.948e-4 -> -3.889e-4 (-1.5 %). 10 um short: -7.16e-6 -> -1.194e-5 (+67 %). 50 um short: -8.03e-5 -> -1.606e-4 (twice).
- The pupil solve against the reference as written (same formula), same cavity: 90 % +2.1e-6 against -2.0e-6; 95 % +3.78e-5 against +3.43e-5; 97 % +7.37e-5 against +6.35e-5; 99 % +9.1e-5 against -1.96e-5. Its own error grows with the chains' length (400, 820, 1380, 4190 returns).
Nothing was changed in JEKray or in the committed reference.

## Round 5 (written 15 Nov 2026 before any run): the solid-angle weight
Tolerances: unchanged. D1/D4 the field with the returns within 2 % of the reference's change (5 % short of concentric, D5); D2 scattered power and extinction 3 %; D3 the far detector 10 %. The degeneracy rule and its constants are not touched.

The weight, as it will be put in both codes. The n-th return of the light sent along u is put on the grid as
  A dOmega' = -(i/lambda) X_n M_n F e^{ik phi_n} dOmega,   X_n = sqrt(|dOmega'/dOmega|) (-i)^kappa_n
in place of (-1)^(n-1). kappa_n counts focal lines: with B(s) the 2 x 2 matrix d(position across the ray)/d(u) along the ray (a neighbouring ray's distance), kappa = (zeros of det B on the free stretches already finished, mirror to mirror, each with its multiplicity) - (zeros of det B on the present stretch's line that lie at or behind the mirror it left: the focal lines it leaves the mirror already past, virtual ones).
Where it comes from (outside both codes): a point source through a paraxial system, per transverse axis, K = e^{ikL} e^{-i pi/4} e^{-i pi mu/2} / sqrt(lambda |B|), mu the focal lines passed (Gouy: a quarter turn each); the sum over directions with phase -k B D theta^2 / 2 is a Fresnel integral of phase -(pi/4) sgn(BD); equating the two gives sqrt|D| (-i)^(mu - [BD > 0]) per axis, and [the last focal line on this stretch is behind the particle] - [it is behind the particle or the mirror] leaves only the virtual ones. It is continuous through exact re-imaging (B = 0 at the particle), and gives (-1)^(n-1) for the concentric and confocal cavities.

Independent evidence to be accepted for the convention (the reference is to be fixed by these, not by JEKray):
- E1, the focal-line count and the sign between the two focal lines: a direct numerical Fresnel quadrature in one transverse dimension (no closed form used: a narrow source's field carried plane to plane by the Fresnel integral done as a sum, through free space and thin lenses), for arrangements before a focus, after one, after two, with D positive and negative, and with the wave leaving the last lens diverging. Accepted if the on-axis field's phase agrees with the formula to 0.02 rad and its size to 2 % in every arrangement. Two transverse axes with different arrangements multiply (the system is separable), which covers the stretch between two focal lines, where the magnifications differ in sign.
- E2, the size and the resonance: the imaginary part of alpha B at 99 %, 50 um short, against the mode-by-mode sum (LG_p0, each with its resonance factor): within 3 %.
- E3, the real part where it converges, if it does: 90 % mirrors, 50 um short, against the mode-by-mode sum with the rim's order varied; reported with its spread, accepted only as a check of sign and size, since the mode sum's rim is not the ray's.
- For the confocal cavity's off-axis particle (D4) there is no closed form: its convention rests on E1 (the same rule, the two axes counted from the 2 x 2 matrices). This will be said in the report.
The reference's grid convergence is to be shown for every case (101, 201 points; 301 where it still moves by more than 0.5 %).
JEKray's chain-length comparison (90, 95, 97, 99 % at 50 um short) is against the corrected reference; "trustworthy" there means within the 5 %.

### Round 5, added before the lock runs: the split of the lock between the two mirrors
Found while setting up: short of concentric both codes also share how the lock is taken from the bench. The bench gives field numbers: the round trip of TEM00 (the Ritz value) and the standing wave's b/f at the particle. JEKray turns the round trip into the ray's by taking TEM00's Gouy phase off, but hands b/f to the ray's half trip by the far mirror as it is; the reference took both from JEKray (lam already the ray's, h2 = b/f). A field's half trip carries its own Gouy phase as the round trip does (b/f = the ray's half trip times e^{i gamma/2} for TEM00, gamma the round trip's Gouy phase: 0.1 rad at 50 um), so the ray's two half trips were split wrongly by that much. A trial with h2 turned by -gamma/2 moved the reference's 10 um case from -1.18e-5 to -1.85e-5.
To be fixed in both, each its own way, so the reference does not borrow JEKray's bookkeeping:
- Reference: from the bench only the two field numbers (ritz, b/f). The mirrors' phases are set so that its own traced returns, with the weight, carry the cavity's own TEM00 (a Gaussian of the Rayleigh range its R and L give, referred to the particle) round with the bench's ritz phase, and bring it back from the far mirror with the bench's b/f phase.
- JEKray: the ray's half trip = b/f with the mode's Gouy phase over that half trip taken off (the same Gouy bookkeeping as its round trip's).
- Evidence accepted: the reference's ray round trip, found its own way, against JEKray's (expected -0.20008 rad at 50 um); and the two half trips against each other. If they differ by more than 0.005 rad the cause is to be found before any D-check is read.

### Round 5, what the runs gave (15-16 Nov 2026). No tolerance, rule or constant changed.
Evidence for the convention:
- E1 (gouy1d.py): nine arrangements of lenses, before and after one and two foci, D of both signs, the wave leaving the last lens converging and spreading: the numerical Fresnel propagation against the propagator and against the weighted sum, size to 4 digits, phase within 0.0042 rad (0.02 allowed). The two ways of counting kappa agree in all nine. Accepted.
- E2: imaginary part of alpha B, 99 %, 50 um short: reference 7.934e-4 / 7.937e-4 / 7.939e-4 (101 / 151 / 201 points); mode-by-mode 8.05e-4 (1.4 %). Accepted.
- E3: at 90 % (2 mm mirrors, 0.6 mm short) the mode-by-mode sum to the rim gives +2.0e-5 to +2.4e-5 (soft edge +1.7e-5 to +2.1e-5) for the change, the reference +1.130e-5: same sign, size within a factor of 2. The mode sum has paraxial frequencies for orders up to 38 (its order-18 modes fall on resonance, which exact rays do not show), so no more is read from it. To order 6 or 12 it gives -3.0e-6 / -3.2e-6, the mode solve's own -3.23e-6.
- The lock: the reference's ray round trip, found its own way, is JEKray's to 5 digits (-0.07921, -0.09376, -0.20018 rad at 2, 10, 50 um). The Gouy phase the light takes in the half trip: reference 0.00305 / 0.07359 / 0.19304, JEKray 0.00213 / 0.07391 / 0.19339 (the mode's own 0.040 / 0.089 / 0.200: at 2 um the light is not the mode). Within the 0.005 written.
- D4's off-axis convention rests on E1 alone, as written.
The reference, each case as it was on main -> now (301 points), and its convergence 101 / 201 / 301:
- concentric +1.415900e-3 -> same; 1.415933 / 1.415928 / 1.415900 e-3.
- concentric-along +2.527716e-3 -> +2.527672e-3; 2.528354 / 2.528120 / 2.527672 e-3.
- concentric-across +1.410030e-3 -> +1.410030e-3; 1.411413 / 1.410537 / 1.410030 e-3.
- 2 um -3.946770e-4 -> -3.870857e-4 (-1.9 %); -3.871524 / -3.870988 / -3.870857 e-4.
- 10 um -7.218818e-6 -> -2.305162e-5 (3.2 times); -2.301317 / -2.304378 / -2.305162 e-5.
- 50 um -8.020650e-5 -> -1.554434e-4 (1.94 times); -1.553867 / -1.554086 / -1.554434 e-4.
- confocal -5.883321e-6 -> same; -5.883495 / -5.883464 / -5.883321 e-6.
- confocal-across dipole -2.795723e-6 -> -2.692269e-6 (-3.7 %); -2.707545 / -2.696997 / -2.692269 e-6. Mie -1.400626e-3 -> -1.397855e-3 (-0.2 %).
- concentric and confocal Mie: unchanged (not re-run: the weight is (-1)^(n-1) to rounding there, shown on the dipole at 64, 101 and 201 points).
- The through-beam number is kept only for the sphere at the middle of the two exact cavities (the two a check reads); dropped for along, across and confocal-across dipole, as main did for the short cases.
D-checks, JEKray against the corrected reference (change off by): concentric 3.0e-4, Mie 6.1e-3, dipole array 1.08e-2; along 6.9e-4; across 2.0e-3; 2 um 1.3e-3; 10 um -5.9e-4; 50 um 7.3e-3; confocal -1.5e-4, Mie 7.2e-3; confocal-across dipole 1.26e-2, Mie 2.8e-3. All inside 2 % / 5 %. D3 unchanged (-0.25 %, -0.35 %, -0.002 %, 0.2 %).
A third error found on the way, in JEKray: a return's phase was taken at the middle of its source cell, and across a cell it runs by up to 4 rad where the return crosses the plane far from the particle. Each cell's share is now its mean (a sinc each way, from -k q.d(d')). At 90 %, 50 um short, particle at the middle: 64 grid -9.4 % and 96 grid +2.3 % before; -1.5 % and -0.9 % with it.
Chain length, 50 um short, particle at the middle, pupil solve made to run against the reference (201 points), as returned field over the light (alpha B):
- 90 % (399 returns): -1.479e-5 + 3.676e-5i against -1.501e-5 + 3.680e-5i; change -2.959e-5 against -3.003e-5 (-1.5 %).
- 95 % (821): -1.084e-5 + 1.0714e-4i against -1.279e-5 + 1.0791e-4i; change -15 %.
- 97 % (1383): -3.96e-6 + 2.150e-4i against -8.80e-6 + 2.1627e-4i; change -55 %.
- 99 % (4192): +2.00e-5 + 7.986e-4i against +0.06e-5 + 7.939e-4i (the reference's real part not converged: 1.8 / 0.8 / 0.6 e-6).
The imaginary part holds to 0.7 %; the real part's error grows 2e-7, 2e-6, 5e-6, 2e-5. None of 95 to 99 % at 50 um is sent to the pupil solve by the degeneracy test.
Inside what the test does send:
- 99 %, 4 um short: -3.1776e-4 against -3.1657e-4 (+0.4 %; reference 151 / 201: -3.16615 / -3.16572 e-4).
- 90 %, 0.2 mm short: -1.323e-5 (64 grid), -1.395e-5 (96 grid) against -1.390 / -1.329 / -1.301 e-5 (151 / 201 / 301): +1.7 % and +7.2 %; the reference itself moves 2 % from 201 to 301.
- 90 %, 0.45 mm short: +9.49e-6 (64), +9.31e-6 (96) against +1.381 / +1.285 / +1.314 e-5: -28 %. Not trustworthy there. The map is carried across the particle's plane by its differences taken 1 um from the particle; at 0.45 mm short the returns cross up to 0.37 mm away (0.12 mm at 50 um).
Timings, 150 nm sphere by Mie: concentric first solve 23 -> 31.6 s, re-solve 6.5 s as before; confocal first 17.9 -> 23.3 s, re-solve 6.2 s.
The mode solve's arbiter: 90 % mirrors 2 mm across, 0.6 mm short (round-trip Gouy 0.696, not degenerate by the test; Fresnel number 33). Reference 101 / 151 / 201: +1.1565 / +1.1294 / +1.1296 e-5 (converged). Pupil solve made to run: +1.101e-5 (-2.6 %). Mode solve: -3.23e-6.

## Round 6 (written 16 Nov 2026 before any run): the mode solve's truncation near degeneracy
New checks, the mode solve (what users get) against the ray reference with the solid-angle weight (independent of the mode solve's list of modes):
- M1: 90 % mirrors 2 mm across, R = 10 mm, 0.6 mm short of concentric, 50 nm dipole at the cavity's middle: the change of |E|^2 at the particle within 5 % of the reference's change (as the short-of-concentric cases).
- M2, M3: one or two more cavities with the round trip's Gouy phase between 0.70 and 1.86 rad, same mirrors' reflectance, the same 5 %, added only where the reference converges (doubling its grid moves its change by under 1 %); a cavity where it does not converge is reported and not made a check.
- Where the reference's change is so small that 5 % of it is under 2e-7 of the intensity (the reference's own grid error at that size), the cavity is not used as a check; said in the report, not settled by loosening.
- The existing scatter-cavity case (452 checks) and every tolerance in it stay as they are and must still pass. The existing Node tests of the mode solve likewise.
- Shift and widening: reported before and after on the validated cavity and on M1; "unaffected" means within 1 % of their value before (they are checked against the reference only where the existing case already does).
None of this is to be changed after the runs; anything that needs changing goes back as a question.

### Round 6, what the runs gave (16 Nov 2026). The 5 % and the rules above were not changed.
Why the list cannot be the fix. Paraxial count mode by mode (paraxord.py, idealised lock), change of |E|^2:
- 0.6 mm cavity (rim at mode order 37): order 6 -5.8e-6, 12 -5.1e-6, 20 +9.8e-6, 30 +8.2e-6, 34 +1.3e-5, 36 +3.5e-5, 40 +2.9e-5, 60 +5.2e-5, 100 +9.5e-5. It does not settle with the order, at the rim or past it; order-18 modes fall on resonance in the paraxial count (0.03 rad off), which exact rays do not show.
- Validated cavity (1.855 rad, R 25 mm, L 10 mm, 5 mm mirrors; rim at order 4221): order 6 -4.9e-7, 12 -3.8e-7, 20 -7.6e-7, 30 -4.1e-7, 40 +2.0e-6, 60 +3.5e-7, 100 -1.9e-6, to the rim +1.6e-6 to +2.3e-6. It does not settle there either, but swings by about 2e-6 of the intensity, a hundredth of what the case checks.
- CAV_KEEP drops nothing that counts on the axis: the 63 of 91 modes dropped are the odd ones, nought at the particle.
- The projection grid (CAV_GRID, CAV_SPAN) was not touched.
- A closed form for all orders (paraxial rays with the rims, one term a return): 0.6 mm -8.6 %, 0.8 mm -1.5 %, 1.0 mm -2.1 % against the reference, but +47 % at 4.0 mm short (1.855 rad) and +18 % at 50 um with 5 mm mirrors: the rim's term needs the exact rays. Not used.
The fix: where the tracer's map has the particle's returns re-imaged (within 0.065 of the cavity's length now, 0.05 for the degenerate solve as before) and they fade within 500 reflections, the mode solve's four sums are the returns followed ray by ray (pupChains) in place of the list's.
Mode solve against the ray reference, 90 % mirrors 2 mm across, R 10 mm, dipole at the middle (reference 151 / 201 points, 301 for the three in the file):
- 0.52 mm (0.65 rad): reference -1.88872e-5 / -1.88862e-5; list -1.0405e-5; with the returns -1.8750e-5 (-0.7 %).
- M1 0.6 mm (0.696): reference +1.12939e-5 / +1.12957e-5 / +1.12986e-5; list -3.227e-6; returns +1.1159e-5 (-1.2 %). PASS.
- M2 0.8 mm (0.805): -1.93363e-5 / -1.93106e-5 / -1.93231e-5; list -6.029e-6; returns -1.9553e-5 (+1.2 %). PASS.
- M3 1.0 mm (0.902): -3.86068e-5 / -3.85096e-5 / -3.85197e-5; list +1.30e-7; returns -3.8112e-5 (-1.1 %). PASS.
- 1.08 mm (0.935): +1.68506e-5 / +1.67348e-5; list +3.144e-6; returns +1.6629e-5 (-0.6 %).
- 4.0 mm (1.855): reference +3.986e-6 / +3.875e-6: moves 2.9 % from 151 to 201 points, not converged by the rule, and 5 % of it is under 2e-7: not a check. The list (no re-image there, it stands) +3.184e-6, 18 % under the reference's last value.
Mirrors 5 mm across (not checks; the returns cross too far from the particle): 0.6 mm reference +6.628e-5, returns +8.312e-5 (+25 %), list -3.2e-6; 0.8 mm reference +8.39e-6 (moves 2 %), returns -7.3e-7, list -6.0e-6; 1.0 mm reference -8.639e-5, returns -8.530e-5 (-1.3 %), list +1.3e-7. The warning stays there: k q^3 / R^2 is 2 to 7 against 0.22 to 0.56 for the 2 mm mirrors.
Shift and widening: identical with and without the returns on all three (they are TEM00's pole; the returns do not enter), and on the validated cavity nothing moves at all (no re-image, the list stands; the same numbers to every digit).
Timings: M1 dipole first trace 3.1 -> 23.6 s, Mie 3.4 -> 24.9 s; a solve after it 2.3 to 2.9 s as before. Validated cavity: unchanged (solve 1.9 s dipole, 2.0 s Mie).
99 %, 50 um short: its returns would take 4124 reflections to fade, over the 500 checked, so the list stands with the warning: -1.068e-4. With the returns followed all the same (150 s): +4.05e-5. Neither is validated; the best estimate remains a magnitude under 3e-5.
