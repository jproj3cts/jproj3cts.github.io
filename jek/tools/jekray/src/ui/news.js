import { EMBED } from '../core/constants.js';
import { project } from '../state/project.js';
import { h } from './panel.js';
import { saveFile, toast, typingIn } from './actions.js';
import { shareBase, shareHash } from '../io/share.js';
import { openProjectData } from '../io/open.js';
import { EXPERIMENTAL, exp, expOn, expPicked, setExperimental } from './experimental.js';
import { readSnaps } from '../io/autosave.js';
import { openDemo, startTour } from './tours.js';

/* ---------- Version, what's new, citing ---------- */
export const APP_VERSION = '1.1', APP_DATE = '12 October 2026';
/* each version: its number, its date, every change, and (from 1.1) the few that matter most,
   shown first with the rest folded away */
const NEWS = [
  ['1.1', APP_DATE, [
    '<b>Folds, tilts, drawings and the design report</b>, the last step of lens design. An assembly may now hold <b>mirrors</b> (flat or curved, the axis folding at each) and lenses <b>tilted</b> up to 30\u00b0 or <b>moved across</b> the axis; the lens engine traces each surface in its own frame, exactly as the bench does, and the layout draws the design folded as it stands. A fold mirror\u2019s tilt tolerance turns its face alone. The <b>Drawings</b> tab gives each lens a dimensioned sheet (its section, diameter, centre and edge thicknesses, surfaces and glass, the tolerances in ISO 10110\u2019s notation) to save as SVG or PDF, and <b>Report (PDF)</b> writes the whole design: conditions, first order, layout, prescription, Seidel sums, spot diagrams, field curvature, distortion, MTF, tolerances and every drawing.',
    '<b>Tolerance the design</b>, the sixth step of lens design: radius (in fringes), thickness and air gaps, lens decentre and tilt, glass index and Abbe number, each with its limit; the image refocused for each build. <b>Sensitivity</b> takes each tolerance alone at its limits, worst first, with the criterion expected over the builds; <b>Monte Carlo</b> builds the lens again and again at random and gives the spread: mean, deviation, the 50, 80, 90 and 98% builds and a histogram. Decentred and tilted lenses are traced exactly, each surface in its own frame. Runs in the background.',
    '<b>Analyses</b>, the fifth step of lens design: in the workspace\u2019s Analyses tab, the <b>spot diagram</b> (every field, each wavelength, with its RMS radius and the Airy disc), <b>ray fans</b> and <b>OPD fans</b>, <b>field curvature and distortion</b>, <b>longitudinal aberration and chromatic focal shift</b>, the <b>wavefront</b> with its Zernike terms, the <b>PSF</b> by FFT with its Strehl ratio and encircled energy, and the diffraction <b>MTF</b> beside its limit, each from real rays, each saving its numbers as CSV.',
    '<b>Optimise the design</b>, the fourth step of lens design: the <b>Merit</b> tab sets what is made small, the RMS spot (about the centroid or the chief ray) or the RMS wavefront error over every field and wavelength, sampled by Gaussian quadrature over the pupil, with terms added for the focal length, F-number, total track, distortion or a Seidel sum, and boundaries on glass and air thicknesses, each term\u2019s share shown. <b>Optimise the design</b> runs damped least squares downhill, or a <b>global search</b> for a better minimum, in the background, on the values marked V. A glass marked V becomes a <b>model glass</b> (its nd and Vd) that the optimiser moves over the glass map, then is replaced by the nearest real glass. The Sweeps menu\u2019s tools are now <b>Optimise the bench</b> and <b>Tolerance the bench</b>.',
    '<b>The lens design workspace</b>, the third step of lens design: <b>Design\u2026</b> in an assembly\u2019s panel (or a double-click on it) opens it on a page of its own, with the conditions it is designed for, its layout traced from each field, its first-order figures, and its <b>lens data</b>: radius, thickness, glass, clear radius and conic for each surface, typed in, marked <b>V</b> for the optimiser, or set by a <b>solve</b> (the image at focus, a radius for an F-number, a thickness for an edge) or a <b>pickup</b>. Insert surfaces and singlets, or take them out; the Seidel sums surface by surface under Analyses. Every change is the bench\u2019s at once. <b>Take conditions from the bench</b> reads the light arriving at it, and its panel on the bench says when it is used outside its design conditions. A design started from nothing is <b>placed on a bench</b> with a source for each field and a screen at its image.',
    '<b>The lens engine</b>, the second step of lens design: an assembly traced as a lens designer traces it, exactly in three dimensions through its surfaces (conics and aspheres), with first-order figures, entrance and exit pupils, rays aimed through the stop and the wavefront error on the exit pupil\u2019s reference sphere. It lands the bench\u2019s own rays where the bench does, to a nanometre, and traces some 10\u2075 aimed rays a second. The design workspace is built on it.',
    '<b>Assemblies</b>, the first step of lens design: select lenses and stops on one axis and <b>Make an assembly</b>. It is picked and moved as one and read as one prescription (its focal length, back focus and stop in its panel), with the aperture, fields and wavelengths it is designed for; nothing the light does changes, and <b>Split into parts</b> gives the parts back. <b>File \u203a New lens design</b> starts one, a lens file of several lenses imports as one, and an assembly exports as a lens file with its stop and conditions.',
    '<b>Steering</b>: a horn moved off an RF lens\u2019s axis steers its beam, and the lens\u2019s readout gives where it points and the scan loss against the horn on the axis, the bench traced again with it there; <b>Work out the scan</b> moves the horn round the lens and plots the scan loss.',
    '<b>How closely it must be made</b>: an RF lens\u2019s readout traces the bench again with its plastic\u2019s permittivity 5% higher and lower, and gives the gain, the focus and what each receiving horn takes in, and how far it may be off before the gain falls 1 dB. A graded-index lens gives the <b>highest frequency</b> it holds to by the design rule (its least dense lines a quarter wave apart), and warns above it; matched faces give the band they match over.',
    '<b>Matching layers</b>: a graded-index lens\u2019s faces can carry a quarter-wave layer, printed less dense, so they reflect nothing at the design frequency (and partly match where the layer cannot be made so sparse); its core is graded to keep the focal length. A made-to-order solid lens\u2019s Matching layer coating is made as a less dense skin, and its panel says whether that can be made.',
    '<b>A flange for a made-to-order lens</b>: under Mounting in the panel of an RF lens in a made-to-order plastic, or a graded-index lens, a flange round its rim with bolt holes, set by its width, thickness, number of holes and their size. It is drawn on the bench, goes in the quote with the lens, and counts towards what can be made.',
    '<b>An RF lens as an antenna</b>: from the bench\u2019s own diffracted field just past the lens (the horn\u2019s field, each face\u2019s traced phase, the rim), taken to the far field: its gain in dBi against the horn alone, its half-power beamwidth and highest sidelobe in the bench plane and across it, and where its aperture efficiency goes (taper, phase, spillover and the lens\u2019s own loss), its pattern plotted beside the horn\u2019s. Worked out in the background. A lens that focuses inside its own far field says so.',
    '<b>Order an RF lens to your design</b>: an RF lens in PLA, ABS, PETG, ASA or polypropylene, or a graded-index lens, that its panel calls manufacturable has an orange <b>Request a quote for this lens</b> button. It puts the lens in the JEK Systems quote cart with its figures and a link to its design; send the request from the cart and we reply with a price. See Custom RF Lenses under Products.',
    '<b>Graded-index RF lens</b> (RF tab, Lenses and mirrors): a flat disc, solid at its centre and less dense towards its edge, so its index falls outwards and it focuses as a curved lens does. Set its focal length, diameter, material, density range, profile (an ideal lens or a parabola) and design frequency; its panel gives the thickness that needs, its index and density from centre to edge, its loss at the centre and the edge, its weight, whether it can be made, and the beam at it with its edge taper. A new example: a graded-index lens on a 24 GHz horn.',
    '<b>RF is out of experimental</b>: the RF tab of parts is there for everyone. RF lenses come in more plastics too (PLA, ABS, PETG, ASA and polypropylene, with typical values), and an RF lens\u2019s panel reads its loss through the centre (absorbed and reflected), its size in wavelengths, the beam at it with its edge taper and the power that misses it, with a warning when the beam is too wide for it or the lens too few wavelengths across, and, for these plastics, whether it can be made. Two new examples: a PLA lens at 10 GHz and an ABS lens on a 24 GHz radar horn.',
    'The tool opens with the bench across the whole page. The <b>gear</b> at the bench\u2019s bottom right opens the Bench panel (light, snapping, notes and the parts list) and closes it again. Selecting a part opens its own panel, and a click on empty bench closes it, the bench taking the page again; what is on the bench stays where it was on the screen as the panel comes and goes, in 2D and 3D.',
    '<b>Locked embeds</b>: Share \u203a Embed has a tickbox to lock the parts, for a product page or a lesson that shows how something works. Readers pan, zoom, turn the 3D view, switch tabs and play the sweeps, but cannot move, change or delete anything. Fixed: the field after a lens of high index (germanium, silicon) uncoated no longer collapses to a thread; the light bouncing between its own two faces is a ghost now, not a cavity, and a solid etalon coated to reflect is a cavity still.',
    '<b>JEKray2D is now JEKray.</b> The address is jeksys.net/jek/tools/jekray.html; the old one, and every old share link, still arrives here. Files, part packs and modules are as they were.',
    '<b>Teams</b> in JEKrayPro: a lab, group or company shares one workspace. Create a team from the account menu, invite people by email (they sign in with Google or Microsoft and are in) as admins, editors or viewers, and subscribe for its seats, £9.99 a seat a month or £99 a year, at least three; viewers are free. Seats follow the members: one added is charged for the rest of the period, one freed comes off at the next renewal. Owners and admins set roles, remove people and see the team’s activity record; the owner can hand the team on. Everyone with a seat has JEKrayPro on their own benches too. The team’s benches sit beside yours in My benches, and a bench goes between the two: <b>Copy to\u2026</b> on its card, or File \u203a Copy to another workspace\u2026 for the open bench, puts a copy in the other workspace that remembers where it came from. <b>One editor at a time</b>: whoever has a bench open holds it, and anyone else opening it sees who is editing (with their picture), looks on as the bench follows their saves, and can take over or work on a copy; a bench card in My benches says who is editing it. A save that clashes with someone else\u2019s says who saved and when. <b>Your account\u2026</b> in the account menu takes a profile picture and your name as others see it. <b>Compare and merge</b>: in a bench\u2019s history, Compare\u2026 on any two versions lists what changed, part by part and setting by setting; a fork\u2019s row offers <b>Merge into this bench\u2026</b> (and a fork\u2019s own history, merging into its original or bringing the original\u2019s changes in), the git way, from the version the fork left at: each side\u2019s own changes go in, and where both changed the same thing you choose. The bench is kept as a version first, the merged bench opens for you to look at, and it is saved as a labelled version of its own; the history graph draws each merge as a dashed line from the fork back into the bench. When a save finds the bench saved somewhere else meanwhile, <b>Merge the two\u2026</b> in that dialog merges your changes with theirs the same way.',
    '<b>The makers\u2019 glass catalogues</b>: Schott, Ohara, Hoya, CDGM and Sumita, some 1,200 glasses by their own dispersion formulas, the crystals, and the optical plastics (PMMA, polycarbonate, Zeonex E48R) and B 270, so an imported lens traces in the glass its maker chose, named as its file spells it (N-BK7, H-K9L, S-LAH64, M-TAF1, K-VC89). <b>Search the glass catalogues\u2026</b> under Material finds any by name, and the panel gives its maker, nd and Vd. <b>Lens import</b> is stronger: .zar archives open (the .zmx inside, and the glass catalogue the archive carries for any glass the tool lacks), files in a Windows code page and UTF-16 read, floating apertures, cylindrical lenses from toroidal surfaces, the design wavelength kept, a moulded asphere\u2019s cover glass left out and said so, and Thorlabs\u2019 moulded glasses (D-ZK3M, D-ZLAF52LAM, H-LAK54M) at their moulded index. Edmund\u2019s coating codes (EO_VIS0 and the rest) set the AR band, and Corning 7980 is known by every name their files give it. The test suite now imports real Thorlabs and Edmund files and checks their focal lengths and back focal lengths against the makers\u2019 own figures.',
    'RF, round two: <b>feed horns launch their real aperture fields</b>. A corrugated horn\u2019s HE\u2081\u2081, a smooth-wall horn\u2019s TE\u2081\u2081 and a diagonal horn\u2019s TE\u2081\u2080 + TE\u2080\u2081 are carried as Hermite\u2013Gauss modes of the fitted Gaussian, so the beam has the horn\u2019s sidelobes and M\u00b2 and its Gaussicity is Goldsmith\u2019s (0.98, 0.91, 0.84); a <b>far-field pattern</b> plot on every horn (E- and H-plane and cross-polar cuts, directivity, half-power widths, first sidelobes); a receiving horn takes in by its own aperture mode, in <b>one polarisation</b> with its cross-polar field across it, or both. And the horns join the <b>electronics</b>: a receiver\u2019s front end is a <b>video detector</b> (V/W, NEP, video bandwidth) or a <b>mixer</b> whose IF out carries each carrier at |f \u2212 f\u2097\u2092|, less its conversion loss, over k (T\u2090\u2099\u209c + T\u1d63\u2093) R, with the system temperature, noise floor and signal to noise in its readout; a feed horn can be an <b>upconverter</b> with an IF in port, so a tone from a signal generator goes up, across the bench and down into a spectrum analyser. A new example, <b>Heterodyne link, 150 GHz</b>.',
    'RF, round one: <b>a frequency sweep</b> on every receiving horn, the bench traced again at each of a band of frequencies and the power into the horn\u2019s mode plotted as S21 in dB, every part at its value for that frequency; and under it a <b>link budget</b>, what each part down the beam took in dB and the coupling into the horn\u2019s mode. The parts are now the real things: the <b>wire grid</b> has a pitch and wires, and reflects the field along them by their inductance and leaks the other by their capacitance (Marcuvitz, with Chuss et al.\u2019s inductance for dense grids), with its wires upright or in the plane, met square or at an angle; the <b>film beam splitter</b> is a dielectric sheet whose two faces interfere, so what it reflects goes with its thickness, the angle and the polarisation; the <b>metal mirrors</b> carry their metal and lose 4 Rs/Z0 a reflection to its surface resistance; the <b>dielectrics</b>\u2019 loss grows with frequency as a polymer\u2019s does, polypropylene joins them, and a lens face can carry a <b>matching layer</b>, a quarter wave at the bench\u2019s frequency; and new <b>mesh filters</b>, inductive, capacitive and resonant, pass a band by Ulrich\u2019s lumped model and reflect the rest. Two examples: a band-pass mesh in a Gaussian beam telescope, swept; a wire-grid diplexer.',
    'A sweep of every example and of benches sent in, for polish and physics. <b>Light</b>: rays are as bright as the light they carry, on a log scale against the strongest ray of their own source, so a window\u2019s 4 % reflection is plainly fainter than the beam it came off, a cavity\u2019s hundreds of passes no longer paint the bench solid, a fibre tip fed through a lossy network is as bright as a laser, and a 5 % leak through a mirror still shows, in 2D and 3D; a dense fan is drawn at twice the resolution, so lines and pixels no longer beat; a laser\u2019s aperture takes in light that reaches it instead of passing it through the housing. <b>The 3D field</b>: each beam as bright as the light it carries (a 5 % leak is 5 % as bright, where every beam was drawn at its laser\u2019s power); a beam clipped by a lens\u2019s rim added to the light round the rim where each cut is taken (the old interpolation between far-apart cuts had left such beams all but dark); a laser\u2019s two polarisation halves added, where one was dropped; rays that meet nothing end a little past the parts. <b>Sweeps</b>: one rendered ahead while the 3D view shows the field renders each step\u2019s 3D field too, so it plays smoothly there; a bench with a module renders ahead and runs its field off the page, the module\u2019s results fetched for each step. <b>The bench</b>: dragging the view with the field shown is smooth however many slices it has; fit view keeps every part clear of the rail and tabs, and the 3D fit comes in as close as the corners allow; names sit under their part whichever way it is turned, step off one another and off port names and sockets, and stay readable at any zoom; an iris shows its opening as a gap; a screen\u2019s profile is a plot with a baseline, as tall as the light is strong. <b>Physics</b>: a surface that turns the wavefront faster than the grid can follow (a high-NA objective) takes the field on a finer grid, and rows finer than the drawn field average their fringes; the field past a narrow slit is sampled across the slit, so its minima land where \u03bbL/a says; a lens narrower than the beam says so in its panel, with the share of light round its rim. Fixed: a sheet of light along the beam in 3D after an axicon; the \u201ccomputing\u201d notice on the 2D/3D switch; on a phone, an example\u2019s view kept from a desk and the minimap covering a third of the bench.',
    'The 3D field shows a whole beam even with a fibre\u2019s face or a tight focus in it: its colours run up to the brightest light but for the brightest 3% of its length, and a spot brighter than that shows in the top colour (the key marks its top \u2265). A ghost of under a ten-thousandth the power no longer turns a beam into an interference map, and a map is sized to the beams that matter, so a strong beam keeps its detail.',
    'Panels close with a \u00d7 beside their pin: a pinned one is unpinned, the main one (the Bench panel too) goes until something is selected, or View \u203a Show the side panel. Fixed: in 3D, where two beams interfere (a Michelson\u2019s output), the field now reaches the part they end on, instead of stopping short of the screen.',
    'An imported part that needed assumptions (a coating from its part number, a fold the importer could not follow, a glass it does not know) says so in red at the top of its panel and carries a ringed red ! on the bench, until dismissed or fixed. A part renamed in My parts comes onto the bench under its new name.',
    'Glasses <b>D-ZK3M</b> (CDGM\u2019s moulding glass, in Thorlabs\u2019 C350TMD and others) and <b>N-SK5</b> (and its twin D-ZK3). A lens of a glass the tracer does not know, with no index given for it, now says so in its panel: it traces as n = 1.5 until you choose the glass.',
    'Denser panels: each setting is one row, its label beside its box, X and Y (and Tip and Roll) side by side. Sweeping is the \u223f button at the end of a row; a swept number shows its sweep folded to one line with Play, and opens to edit, one at a time. Sections fold under their headings and stay as you left them, readouts gather in a Readout section, and the longer explanations sit under About this part.',
    '<b>Export a lens (.zmx)</b> (File menu): the lenses selected, as a sequential prescription that lens-design programs open, with every face\u2019s radius, conic, aspheric terms, glass and aperture, the bench\u2019s wavelengths, and the image at the paraxial focus. Lenses and windows on one axis go as one system; a mirror can go on its own.',
    'Beams are cut along the surfaces they meet, in 2D and 3D, their envelope and their diffracted field alike: at a 45\u00b0 mirror the beam in ends on the mirror and the beam out starts from it, where before each ended square across its axis, half of it past the mirror and half short of it.',
    'Experimental: <b>Modules</b> (Help \u2192 Experimental features\u2026), part packs that carry code, written by anyone: new <b>plates</b> (any amplitude and phase across the face, as a metasurface or a measured phase map), <b>polarisation plates</b> (a Jones matrix), <b>fibre components</b> (a scattering matrix), <b>electronics blocks</b> (a response and its noise) and <b>readouts</b> for screens and detectors. Their code runs in a sandbox apart from the page, with no way to your account, your files or the internet, and is asked only for numbers, each checked before it is used. Installed after a prompt listing what a mod adds; a bench carries the code of the modules it uses, and offers them when opened. An example module and a guide to writing one are in the documentation.',
    'Experimental: <b>RF and millimetre waves</b> (Help \u2192 Experimental features\u2026), a new <b>RF</b> tab of parts for quasi-optics from 1 GHz to 3 THz. A <b>feed horn</b> (corrugated, smooth-wall, diagonal or ideal) launches the Gaussian beam that fits its aperture, set by its frequency in GHz and its power in dBm; a <b>receiving horn</b> takes in the overlap with its own mode, in dBm and as a share of what arrives. <b>RF lenses</b>, white, of the RF dielectrics (HDPE, PTFE, Rexolite, TPX, silicon, quartz, alumina, nylon), absorb by their loss tangent, and metal mirrors, wire grids, film beam splitters and absorber loads complete the bench. A new example, <b>Millimetre-wave link, 150 GHz</b>, and a page in the documentation. Optical sources now stop at 1 mm (and start at 100 nm): longer waves are the RF tab\u2019s.',
    '<b>Fly</b> is part of the tool, no longer experimental: the bird on the 3D view\u2019s bar flies you through the bench, full screen (W A S D to move, the mouse to look, Q and E to roll, Space and Ctrl up and down, Esc to land).',
    'In the 3D view, beams of one laser running together now add as <b>fields</b>: an interferometer\u2019s dark port is dark there, as on its screen. The 3D field is worked out on several of the computer\u2019s cores at once. A screen with light from several lasers weighs each by its power.',
    'The 3D view\u2019s <b>view cube</b> shades the face, edge or corner under the pointer, so it is clear which way a click will look from; its bar keeps just Fly (a bird), Fit, Names, the mouse and PNG (the views are on the cube, and on Shift+1 to 7). The Draw palette steps aside in 3D, drawings being 2D only. Flying, Q and E roll the view (Space and Ctrl rise and fall), and the mouse turns it about its own axes; landing levels it.',
    'A screen\u2019s Diffraction tab has <b>Phase</b> (the field\u2019s phase as hue, its amplitude as brightness: tilt fringes, curvature rings, a vortex\u2019s winding) and <b>Polarisation</b> (how circular the light is, point by point, with an ellipse drawing the field\u2019s path every few pixels), each with its key.',
    '<b>The diffracted field in 3D</b>: with <b>Show the diffracted field</b> ticked, the 3D view shows each beam as a glowing volume coloured by its irradiance, a focus pinching and an aperture\u2019s rings spreading as the field has them, with a key in W/cm\u00b2. Point at the light to read the irradiance there. <b>Field intensity</b> can now be logarithmic over 60 dB, to see a focus and the beam that makes it together.',
    '<b>Experimental features</b> (Help \u2192 Experimental features\u2026) each have a tick of their own: the switch at the top turns on the ticked ones, so you can try Fly without photonic circuits, or the other way round.',
    '<b>Part packs</b> (File \u2192 Part packs and modules\u2026): sets of parts and glasses made by others, a maker\u2019s catalogue or a course\u2019s kit, installed from a file or a link once you have seen what is in them. Their parts are under + Add part \u2192 Packs and their glasses in each lens\u2019s material menu; a part placed from one carries its glass with it, so the bench opens anywhere. Packs hold data only, never code. <b>Make a pack from the selection</b> turns your own parts into one to share.',
    'Experimental: <b>Try me</b>, a white box in the bottom right corner while flying through the bench, with a QR code that opens a copy of it on a phone, \u201cTry me!\u201d above it.',
    '<b>Sweeps, faster</b>: a sweep that renders the field renders on several of the computer\u2019s cores at once, coarse to fine, and starts playing within a moment of pressing Play, filling in as it goes; and a ray sweep keeps each step it has traced, so from its second cycle it only draws.',
    'Less waiting on the page while the field is worked out: a photodiode that samples the field reads it from the background worker; a photodiode behind a cavity opens four times as fast (its beat notes pair each sideband\u2019s light as one beam, not every round trip with every other, and its figure while the cavity\u2019s field is on its way is worked out more coarsely).',
    'A sweep that renders the field now plays smoothly with a screen open on its Diffraction tab, and after a pause: each step was asked for a field it had not been rendered for, and worked out again on the spot. Played again with every step rendered, it starts at once, and the time left counts only the steps still to work out.',
    '<b>STL objects</b> are kept compactly with the bench, so a CAD part now saves to the cloud too (a mesh of more than 40 000 triangles is simplified as it comes in, to its outline\u2019s detail, and the panel says so); and <b>\u2605 Save to My parts</b> in its panel keeps it in your parts library.',
    'An <b>electrical feedthrough</b> (Elec \u2192 Feedthrough): a pair on two tabs carries signals between them, both ways, as a bulkhead connector does. A photodiode on the optical bench can feed a lock-in on an electronics tab, and a generator there drive a modulator back on the bench.',
    'Fibre tips send their rays out as a line, a cross, a grid or hexapolar rings, as a source does, so in 3D the light leaving a fibre fills its cone. A Gaussian beam wider than a lens now shows the share of it that goes round the rim as faint bands outside it, not as a whole beam passing by.',
    'Moving and turning parts in the <b>3D view</b> is now smooth: each step of a drag no longer compiles the view\u2019s shaders again, which made it stutter.',
    'An <b>eye</b> beside each part in the Bench panel\u2019s list hides it in the 3D view (click it again to show it): handy to see past a housing, a mount or a big optic. The light still meets the part exactly as before, and the choice is saved with the bench.',
    '<b>Light</b> is now set for the whole bench, in the Bench panel (click an empty part of the bench), as three ticks: the rays, the Gaussian beams\u2019 envelope, and their diffracted field (linear or log), each on or off. Benches saved with a field view on a source open with it on.',
    'A part\u2019s height is now its <b>z</b>, and <b>z, Tip and Roll can be swept</b> like any other number. Panels line their boxes up side by side, and rays leaving a fibre\u2019s end (a tip, or a fibre-coupled laser) now spread as its beam does, at the mode\u2019s angle.',
    '<b>Sweeps that render the field</b> play every step in turn, waiting for one to be drawn before the next, so a fast sweep stays smooth rather than skipping; a sweep\u2019s rate can be changed once it is rendered without rendering it again; and the render says about how long it has left.',
    'The <b>3D view</b> turns smoothly over and under the bench (the board fades seen from below), and a tab with fibre, electronic or chip parts opens in 3D too, those parts left out. Experimental: <b>Fly</b>, on the 3D view\u2019s bar, fills the screen with the bench to fly through it with W A S D and the mouse; Esc lands.',
    '<b>STL objects</b>: bring in any shape from CAD as a .stl file (Open \u25be \u2192 Import an object, or drop it on the bench), a mount, a post, a housing, a baffle, and place and turn it in 3D as any part. It is opaque: every ray that meets it stops there, met against its triangles exactly.',
    'The <b>3D view</b> is now part of the tool, no longer experimental: the <b>2D / 3D</b> switch at the bench\u2019s top right (or <b>View \u2192 3D view</b>) shows any tab of free-space parts in three dimensions, and every free-space part has its <b>z</b> (height), <b>Tip</b> and <b>Roll</b> in its panel. Everything below that says \u201cin the 3D view\u201d is there for everyone.',
    'Parts met at an angle, turned or (in the 3D view) tipped: a <b>vapour cell</b> absorbs over the longer path through it, an <b>EOM</b> modulates over it (\u03b2 / cos \u03b8), and a <b>doubling crystal</b> sees its poling at the angle; tipped, its harmonic leaves with the light, raised as a tipped plate raises it.',
    '<b>Misaligned cavities</b>: a mirror turned or (in the 3D view) tipped, or a beam sent in off the axis, now walks the field round the cavity as a real one does, so it transmits only the share of the light in its mode. The cavity\u2019s panel gives its axis across and up from the input beam, mode matching with the offset and tilt both ways, and how far each mirror walks the axis per \u00b5rad. Tips and rolls are kept to a millionth of a degree.',
    'In the 3D view, <b>move and turn a part along all six axes</b>: click it for three double-ended arrows out of both sides of it (Jek orange along x, chip green along y, Jek blue up), and click it again for three rings crossing round it, each the colour of the axis it turns about (blue turns it to face another way, green tips it, orange rolls it about its own axis; Shift for 15\u00b0 steps, Alt a tenth as fast). A third click brings the arrows back.',
    'In the 3D view, <b>crystals turn their optic axis</b> with their tip and roll: a rolled beam displacer walks its beam off along the roll, a Wollaston prism rolled 45\u00b0 splits p light into two equal beams on the diagonal, and the extraordinary index and walk-off follow the light\u2019s own angle to the turned axis. A <b>rolled doubling crystal</b> converts the light along its turned axis, and its harmonic leaves polarised along it.',
    'In the 3D view, a <b>rolled grating</b> sends its orders round with its grooves (rolled 90\u00b0, up and down instead of across), and a <b>rolled waveplate, polariser or isolator</b> turns its axis with it, so one rolled with a rolled source stays aligned to it. An AI-written bench may now put parts one over the other, such as a periscope\u2019s two mirrors, at different heights.',
    'In the 3D view, <b>the diffracted field in 3D</b>: a screen\u2019s Diffraction tab, a photodiode read through the field and the vector focus follow heights, tips and rolls: the pattern lands where the beam does, on a tipped screen as the screen sees it; a periscope\u2019s vertical leg is propagated, and one that turns the beam turns its image and polarisation; a rolled Dove prism turns the pattern; an iris above or below the beam clips it there. Tick <b>Show its diffraction pattern on its face</b> on a screen to see its pattern painted on it in the 3D view.',
    'In the 3D view, <b>Gaussian beams through turned optics</b>: a beam through a part tipped or rolled out of the plane is carried as one complex 2\u00d72 matrix (a general astigmatic beam), so its ellipse turns with a rolled cylinder, a photodiode or fibre tip takes it as it is, and the 3D view draws it turned. Higher-order modes go with it: an HG<sub>10</sub> beam through a mode converter rolled 45\u00b0 leaves as an LG<sub>01</sub> vortex, a rolled Dove prism turns a mode by twice its roll, and a beam twisted by parts at odd angles is marked. A cavity with a rolled or tipped part is solved from its 4\u00d74 round trip, its mode\u2019s axes turned with it.',
    'In the 3D view, photodiodes and fibre tips take a beam <b>where and as it lands</b>: above or below their centre, sloped, or on a face tipped or rolled out of the plane, the footprint stretched up the face as it should be. A fibre tip raised or tipped off a beam couples exactly what one moved or turned across it does; a small beam landing well off a large diode\u2019s centre is no longer missed; and moving a fibre tip up or down re-solves its fibre network at once.',
    'In the 3D view, <b>roll</b> any free-space part about its own axis (its Roll): a cylindrical lens at 45\u00b0, a grating with its grooves turned, and a new <b>Dove prism</b> (a prism shape), which turns the image by twice its roll. A rolled source turns its rays and its polarisation with it.',
    'In the 3D view, <b>tip any free-space part</b> out of the plane (a lens, a plate, a cube, a grating, a screen, a source), by its green ring or its Tip, and <b>periscopes</b>: light sent straight up or down is followed, so two mirrors tipped 45\u00b0 one over the other lift a beam to a new height, turning its polarisation as a real periscope does when it turns the beam too. A tipped plate shifts the beam up as a turned one shifts it across; a tipped lens shows the aberrations of one met at an angle.',
    'In the 3D view, <b>tip a mirror</b> up or down, as the vertical knob of a kinematic mount does: drag its green ring (Alt for fine steps) or type its Tip. The light leaves by the tipped normal in 3D, and a tipped fold turns the polarisation as a real one does; two mirrors tipped against each other walk a beam up and leave it level.',
    'In the 3D view, <b>rays traced exactly in 3D</b>: a ray off a lens\u2019s or mirror\u2019s centre, or rising, meets the real surface where it reaches it and bends by its normal there, by Snell\u2019s law and the law of reflection as vectors; Fresnel losses and coatings take s and p from each surface\u2019s own plane of incidence; a cylinder curved out of the plane focuses up and down; a grating sends light arriving at a rise out on its cone; a mask bends light by its delay\u2019s slope both ways. A bench with every part at the beam height traces exactly as before.',
    'In the 3D view, <b>rays across the whole beam</b>: a source\u2019s rays as a line (as ever), a cross, a grid or hexapolar rings, up and down the beam as well as across it; a screen\u2019s Rays tab has a spot diagram, across against up.',
    'In the 3D view, <b>heights</b>: drag the arrow over a part to raise or lower it, or type its z. The light follows, out of the plane: a part above or below the beam is missed, a lens or curved mirror met off its centre turns the beam up or down, and a photodiode or fibre tip off the beam\u2019s height takes only what overlaps it. A part not at the beam height shows by how much under its name on the 2D bench. A bench with every part at the beam height traces exactly as before.',
    'In the 3D view, <b>arrange the bench</b>: drag a part across the table (snapped to the grid, the selection together), turn one by the ring round it (Shift for 15\u00b0 steps), right-click for the bench\u2019s menu, and parts added or dropped land where you are looking.',
    'A <b>3D view</b>: the 2D / 3D switch at the bench\u2019s top right (or View \u203a 3D view) shows a tab of free-space parts in three dimensions, each part made from its own numbers at the beam height over a breadboard, the rays and Gaussian beams as the trace has them. Turn, pan and zoom with the mouse (right-drag, middle-drag, scroll), or as on a trackpad; a view cube and the standard views (Shift+1 to 7, F to fit); click a part to select it and edit it as ever. Save the view as a PNG.',
    'On photonic chips, <b>electrical connections</b>: an on-chip photodiode now has an <b>out</b> port to the electronics (a voltage through its amplifier, or its current as a bare photodiode), and a phase shifter a <b>drive</b> input, \u03c0 of phase for V\u03c0 volts on top of the phase set, so a chip\u2019s Mach\u2013Zehnder or ring can be modulated, swept or locked from the electronics.',
    'A fix: light going back through a <b>fibre AOM</b> is now shifted the same way again, so a double pass (an AOM before a Faraday mirror) shifts by twice the drive, as a real one and the free-space AOM do. It was shifted back to where it started.',
    'The <b>documentation</b> (Help \u203a Documentation): how each model works, with its equations and limits: free space, fibre, electronics and photonic chips, element by element, with an FAQ.',
    'In the Draw palette, a <b>bar along the top of the bench</b>: flip (H, V), rotate, raise to top, raise, lower and lower to bottom (Home, Page Up, Page Down, End), and <b>Align and distribute</b> (Ctrl+Shift+A) for drawings and parts by their boxes. Click a picked drawing again and its handles <b>rotate</b> (corners) and <b>skew</b> (sides) it. Ctrl keeps the pen, and a node dragged with the node tool, to 15\u00b0 steps from the point it joins. Flip is for drawings: parts are not mirrored. Parts\u2019 names are now sized on the bench, so a figure looks the same at any zoom (View \u203a Larger names, Smaller names). In Draw, parts stay put: clicks and boxes pick drawings only, and a part\u2019s name can still be picked, moved and scaled.',
    'More for figures: a <b>Text</b> tool (T) that writes on the bench and retypes a part\u2019s name where you click it; the select tool <b>moves and scales part names</b> (drag a name, then its corner) and scales drawings by their eight handles; <b>Flip</b> horizontal and vertical (H, V); and <b>Group</b> and <b>Ungroup</b> on the right-click menu (Ctrl+G, Ctrl+Shift+G): a group is picked and moved as one, Ctrl+click picks one of it. A drawing\u2019s panel is laid out with icons: paint, colour with swatches, opacity, then width, dashes, join and cap.',
    '<b>Draw</b>, a palette of its own on the parts rail down the bench\u2019s left: select, node tool, rectangle, ellipse and pen (S, N, F4, E, B), for boxes, arrows and outlines on your figures. Pick a drawing and its panel sets its shape, and its fill and stroke (colour, opacity, width, dashes, caps and joins); the next one takes the same style. Drawings sit under the light or over it, and the light goes through them as if they were not there. And Measure has moved off the bar: it is in the View menu, and on M.',
    '<b>Export layout (current view)</b> (File menu): a PNG, SVG or PDF of just what is on screen, as you have it framed. Export layout now gives the whole tab, framed to fit, whatever part of it you are looking at.',
    '<b>Bench colour</b> (View \u203a Bench colour): the dark breadboard, black, navy, paper, white or a colour of your own, kept with the bench and used for exported pictures; parts, beams and fibres look the same on any colour, and on a light one the words are drawn dark. And View \u203a Grid holes, to leave the holes off for a figure.',
    'The <b>academic price</b> (and a university\u2019s licence) with any sign-in: confirm your university email address with a 6-digit code we email to it, in the JEKrayPro box.',
    '<b>My parts</b>, with JEKrayPro: keep a part set up as you want it (a lens of your own, an imported Thorlabs part, a tuned laser) or a whole assembly with its fibres, from the right-click menu, and it is in + Add part \u203a My parts, the search and the rail\u2019s \u2605 on every bench and any computer. Click to add it, or drag it where you want it. Its tab also imports .zmx files (one or a whole folder\u2019s worth) straight into it, named by part number.',
    '<b>My benches is a page of its own</b> (the grid button by the bench\u2019s name, or File \u203a My benches): your cloud benches as cards with their pictures, or as a list, with folders down the side, Recent, search, sorting and the bin. And <b>forks</b>: fork a bench, or any version in its history, to try something without touching the original; a bench\u2019s history is drawn as a graph, its versions on one line and each fork branching off from the version it was made from. File \u203a Fork this bench carries on in a fork of the one you are working on. Both with JEKrayPro.',
    '<b>JEKray is in open beta</b>, and so is <b>JEKrayPro</b>: sign in with Google or Microsoft (university or work) from the top right, and your benches save to the cloud as you work, with their history, folders, a bin and a picture of each, on any computer. Subscriptions, the academic price and university licences are open. The tool itself stays free, with or without an account.',
    'The diffracted field is worked out <b>in the background again</b>, so the page no longer stalls while it runs. A field that would take a long time says so first, and offers what would lighten it: fewer grid points, a higher power floor, or not following weak reflections. Beams past a mask are drawn at their full width, and a trap\u2019s screen no longer splits a retroreflected beam. A beam wider than a lens no longer multiplies: light at a lens\u2019s ground edge stops there, and light that went round it stops at a smaller stop. The optimiser reads a Gaussian beam\u2019s size and collimation with the ray fan hidden. A tight focus is drawn as it is, into the trap and out of it, without the gap, the streak and the sudden block.',
    '<b>Electronics</b>, now a standard part of the tool (no longer experimental): a palette of its own, in yellow, of sources, amplifiers and a TIA, filters, an attenuator, a mixer, a summing junction, a bias tee, a comparator and nodes, read by an <b>oscilloscope</b> (Normal and Roll, each channel\u2019s scale set or automatic), a <b>spectrum analyser</b>, a <b>lock-in amplifier</b> and a <b>DAQ</b> (sampling, aliasing, quantisation). Wired to the light: photodetectors and the chopper feed them; they drive lasers\u2019 power and frequency, AOMs, EOMs and fibre stretchers. A lock-in absorption example.',
    'A source\u2019s <b>coherence</b> is a choice of three: a single frequency, a line of its own, or <b>incoherent, broadband</b> light given by its bandwidth, which adds as powers but for near-equal paths (white-light fringes).',
    'A <b>fibre-coupled LED</b>, and unpolarised fibre lasers. In fibre, broadband light is followed across its band, so filters, WDMs and Bragg gratings shape it, and it beats with itself on a photodetector.',
    'New <b>fibre parts</b>: splitters and combiners (1\u00d7N, typed), M\u00d7N star couplers, a polarisation beam splitter, a <b>balanced photodetector</b>, an <b>optical spectrum analyser</b>, a fibre mirror, an optical switch, a variable delay line, a fibre stretcher (piezo, with a drive input), a tunable filter, a depolariser and a semiconductor amplifier. Fibres\u2019 ends can be connectors that reflect (PC, APC, flat cleaves).',
    'Photodetectors in free space and fibre now work alike (material, dark current, amplifier noise), the free-space one drawn as a semicircle, with scope and spectrum views that match the instruments. An <b>optical chopper</b> for the free-space palette.',
    'A bench that fills the window, a <b>Bench panel you can pin</b>, R and Shift+R to turn parts, steady readouts while sweeping, and the optimiser on mirrors as on screens.',
    'Faster: moving electronics no longer re-solves them, and a laser\u2019s power drive is traced at its two ends when nothing on the bench saturates.'], [
    'A <b>3D view</b> of every bench, a switch away: every free-space part placed, tipped and rolled in all six degrees of freedom, with rays, Gaussian beams and the diffracted field followed exactly through it, misaligned cavities included.',
    '<b>STL objects</b> from CAD on the bench (mounts, housings, baffles), saved with it and kept in My parts.',
    '<b>Electronics</b> as a standard part of the tool, with <b>feedthroughs</b> carrying signals between tabs, and photonic chips wired to them.',
    '<b>JEKrayPro</b> in open beta: benches in the cloud with their history, My benches and My parts; and the <b>documentation</b>, with the equations behind every model.',
    '<b>Draw</b> on the bench for figures, and export just the view you have framed.',
    'Smoother all round: sweeps that render the field play every step, parts drag smoothly in 3D, and long sums run in the background.']],
  ['1.0', '28 September 2026', [
    'The free edition. An <b>examples gallery</b> with a picture of each bench, and a search.',
    '<b>Guided tours</b>: focus a laser beam, and build a Michelson interferometer, step by step on a tab of their own.',
    '<b>Earlier versions</b> (Open ▾): this browser keeps copies of your project as you work, and before you open something else.',
    '<b>Embed</b> a live bench in a web page or course notes, from the Share link dialog.',
    'A shared link opens with a bar to keep the bench, or go straight back to your own work.',
    'A <b>Cite</b> button, and a licence page.',
    'Short pulses, nonlinear optics, vapour cells and optical traps are no longer beta: each is now checked on the validation page. Polarisation spectroscopy, optical lattices and the gas damping of levitated particles stay in beta until they are checked too.',
    'An <b>Experimental features</b> switch (under the toolbar): new features arrive there, off until you turn them on, before they reach beta.',
    '<b>Photonic circuits</b> (experimental): grating couplers, directional couplers, MMIs, rings, phase shifters and on-chip photodiodes, joined by waveguides on a green palette, with a spectrum view; TE near 1550 nm, checked on the validation page against closed forms and SAX.',
    'A <b>validation page</b> that runs JEKray against published results and independent codes in your browser. Vapour cells now use Alcock et al.\u2019s vapour pressures, which put about 2.5% fewer atoms in a rubidium cell at 50 \u00b0C than before.']],
  ['Before 1.0', '23–27 September 2026', [
    'Beams split where they cross an element’s edge: the part that misses carries on.',
    'Aberration analysis across the field: Seidel and Zernike terms, spot diagrams, field curvature and distortion, with the chief ray aimed through the stop.',
    'Nonlinear optics (beta): frequency doubling in PPLN and PPKTP, self-phase modulation and solitons in fibre.',
    'Atoms and traps (beta): rubidium, caesium and potassium vapour cells, saturated absorption, Zeeman shifts (DAVLL, Faraday filters, polarisation spectroscopy), dipole traps, lattices, tweezers and levitated particles.',
    'Short pulses (beta): spectral phase through glass, prisms, gratings, chirped mirrors and fibre; compressors and stretchers.',
    'Lasers that settle at their output power; fibre subsystems with PM and multimode fibre and amplifiers.',
    'Higher-order modes (Hermite–Gauss, Laguerre–Gauss, vortices) and SLM masks.',
    'An optimiser over several parameters and goals, and tolerancing.',
    'Tabs of benches joined by link planes; share links; an AI assistant guide; background tracing for big benches.']],
];
const CITE_URL = 'https://jeksys.net/jek/tools/jekray.html';
/* A bug report by email: what happened, what was expected, the version and browser, and
   (if wanted) a link that opens the bench as it is. An email link carries a few thousand
   characters at most; a bench too big for that is asked for as a file instead. */
const BUG_TO = 'support@jeksys.net', BUG_MAILTO_MAX = 1900;

/* The examples, by group: file name in demos/, title, and one line on what it shows. The
   gallery shows each with a picture from demos/thumbs/. */
export const EXAMPLES = [
  ['Interference and cavities', false, [
    ['michelson', 'Michelson interferometer', 'Move a mirror and watch the fringes at the output port walk.'],
    ['mach-zehnder', 'Mach–Zehnder interferometer', 'Two arms, two outputs: the power swaps between them with the path difference.'],
    ['fabry-perot', 'Fabry–Perot cavity', 'Free spectral range, finesse, linewidth and the cavity’s Gaussian mode.'],
    ['fox-li', 'Fox–Li: a cavity finds its mode', 'Light bounced round a cavity settles into its lowest-loss mode.'],
    ['pdh-lock', 'Pound–Drever–Hall lock', 'Sidebands, a cavity and a photodiode give the classic PDH error signal.'],
    ['laser-threshold', 'Laser cavity with gain', 'A Nd:YAG gain sheet in a cavity: threshold, output power and the mode.']]],
  ['Diffraction and imaging', false, [
    ['youngs-double-slit', 'Young’s double slit', 'Two slits, one screen, and the fringe spacing you expect.'],
    ['poissons-spot', 'Poisson’s spot', 'The bright spot in the shadow of an opaque disc.'],
    ['plano-convex', 'Plano-convex lens, both ways round', 'Why the curved side should face the collimated beam.'],
    ['lens-aberrations', 'Aberrations of a singlet across the field', 'Seidel and Zernike terms, spot diagrams, field curvature and distortion.'],
    ['tight-focus', 'A tight focus, vector', 'A high-NA focus where polarisation shapes the spot.'],
    ['maltese-cross', 'Maltese cross', 'A steep focus seen through a polariser.'],
    ['off-axis-parabola', 'Off-axis parabola', 'A 90° off-axis mirror focuses with no spherical aberration.'],
    ['bessel-beam', 'Axicon: a Bessel beam', 'A cone lens makes a long, narrow line focus.'],
    ['vortex-beams', 'Vortex beams: mode converter and SLM', 'Light with orbital angular momentum, made two ways.'],
    ['optical-differentiator', 'Optical differentiator', 'A 4f system with a ramp in its Fourier plane takes the derivative of the light.'],
    ['optical-integrator', 'Optical integrator', 'The same 4f system with a 1/x mask integrates it instead.']]],
  ['Polarisation and spectra', false, [
    ['wollaston-polarimeter', 'Wollaston polarimeter', 'A half-wave plate and a calcite Wollaston split s from p.'],
    ['optical-isolator', 'Optical isolator', 'A Faraday rotator stops light getting back into the laser.'],
    ['grating-spectrometer', 'Grating spectrometer', 'Mercury lines spread out by a transmission grating.'],
    ['dispersing-prism', 'Dispersing prism', 'White light split into colours by an N-SF11 prism.'],
    ['dichroic-combiner', 'Dichroic combiner, two tables', 'Two lasers combined, carried between tabs by link planes.']]],
  ['Fibre', false, [
    ['fibre-heterodyne', 'Fibre heterodyne (AOM beat note)', 'An AOM shifts one arm; the photodiode sees the beat.'],
    ['split-laser', 'Two fibre launches from one laser', 'One laser, split and launched into two fibres, recombined in free space.'],
    ['fibre-michelson', 'Fibre Michelson, Faraday mirrors', 'An all-fibre interferometer that cancels polarisation drift.'],
    ['fibre-amplifier', 'Fibre amplifier and its noise', '20 km of fibre, an erbium amplifier, and the noise it adds.']]],
  ['Atoms and traps', false, [
    ['saturated-absorption', 'Saturated absorption, rubidium', 'Doppler-free hyperfine lines from a pump and probe.'],
    ['polarisation-spectroscopy', 'Polarisation spectroscopy', 'A circular pump makes the vapour birefringent: a dispersive lock signal.'],
    ['davll-lock', 'DAVLL: a lock from a magnetic field', 'Zeeman-split absorption gives a wide error signal.'],
    ['faraday-filter', 'Faraday filter', 'A hot cell in a field between crossed polarisers passes a narrow band.'],
    ['dipole-trap', 'Optical dipole trap, rubidium', 'A focused 1064 nm beam: trap depth, frequencies and scattering.'],
    ['optical-lattice', 'Two-dimensional optical lattice', 'Four beams make a grid of traps.'],
    ['optical-tweezers', 'Optical tweezers in water', 'A bead held by an NA 1.2 objective: stiffness and forces.'],
    ['levitated-nanoparticle', 'Levitated nanoparticle in air', 'A 150 nm silica sphere held in vacuum by a tight focus.']]],
  ['Pulses', false, [
    ['pulse-compressor', 'Grating pulse compressor', 'A grating pair takes a chirped pulse back to its transform limit.'],
    ['fibre-solitons', 'Self-phase modulation and a soliton', 'The same pulse broadens in one fibre and holds its shape in another.']]],
  ['Nonlinear optics', false, [
    ['frequency-doubling', 'Frequency doubling: PPLN and PPKTP', '1560 nm to 780 nm and 1064 nm to 532 nm in poled crystals.'],
    ['fibre-solitons', 'Self-phase modulation and a soliton', 'Spectral broadening from the Kerr effect in fibre.']]],
  ['Electronics', false, [
    ['lockin-absorption', 'Lock-in absorption measurement', 'A sample’s transmission from two lock-ins, the light square-wave modulated at 1 kHz.']]],
  ['Modules', false, [
    ['mod-vortex', 'A module: vortex through a metalens', 'A part pack with code: a spiral phase plate and a metalens written as a module.', 'mods']]],
  ['RF and millimetre waves', false, [
    ['rf-10ghz-pla-lens', 'PLA lens, 10 GHz', 'A horn\u2019s beam collimated by a PLA lens: its loss, its edge taper, and whether it can be made.'],
    ['rf-24ghz-grin-lens', 'Graded-index lens, 24 GHz', 'A flat disc whose density falls from its centre to its edge focuses a horn\u2019s beam: its design and what it comes to.'],
    ['rf-24ghz-abs-lens', 'ABS lens, 24 GHz radar', 'A radar horn behind an ABS lens: the band where plastic RF lenses of this size work best.'],
    ['mm-wave-link', 'Millimetre-wave link, 150 GHz', 'Two feed horns and two HDPE lenses: the power a horn takes in, in dBm.'],
    ['mm-wave-mesh-filter', 'Mesh filter, swept', 'A band-pass mesh in a Gaussian beam telescope: the receiver\u2019s S21 against frequency, and its link budget.'],
    ['mm-wave-grid-diplexer', 'Wire-grid diplexer, 150 GHz', 'A wire grid at 45\u00b0 sends the field along its wires one way and passes the other: what it reflects and leaks, from its pitch and wires.'],
    ['mm-wave-heterodyne', 'Heterodyne link, 150 GHz', 'A 1 GHz tone up on a 150 GHz carrier, across two lenses and down through a mixer to a spectrum analyser.']]],
  ['Photonic circuits', false, [
    ['ring-filter', 'Ring filter on a chip', 'A ring between two waveguides drops one line of a laser tuned across it.', 'pic']]],
  ['From a paper', false, [
    ['levitated-trap', 'Levitated nanorod trap (Hu et al. 2023)', 'The standing-wave trap from a Nature Communications paper.']]],
];
/* Examples whose model is still in beta, where their whole group is not: they have no check of
   their own on the validation page yet (polarisation spectroscopy, a lattice), or fail one
   (a levitated sphere's gas damping, against Gieseler et al.'s measurements) */
const BETA_EXAMPLES = new Set(['polarisation-spectroscopy', 'optical-lattice', 'levitated-nanoparticle']);
const exampleTitle = k => { for (const [, , list] of EXAMPLES) for (const [id, t] of list) if (id === k) return t; return k; };
/* the first visit: what to do first, and where the examples are */
export function hideWelcome() {
  const w = document.getElementById('welcome');
  if (w) w.remove();
  try { localStorage.setItem('jek-raytracer-welcomed', '1'); } catch (err) { /* shown again next time: fine */ }
}
export function showWelcome() {
  try { if (localStorage.getItem('jek-raytracer-welcomed')) return; } catch (err) { return; }
  const pick = h('button', { class: 'rt-btn', type: 'button', onclick: () => openGallery() }, 'Browse examples');
  document.getElementById('stage').append(h('div', { class: 'rt-welcome', id: 'welcome', role: 'note' },
    h('h3', null, 'Welcome to JEKray'),
    h('ul', null,
      h('li', null, 'Add parts with + Add part (or A), or from the parts rail at the bench\u2019s left; its coloured buttons switch between free space, fibre and the experimental palettes.'),
      h('li', null, 'Drag to move, scroll to zoom, middle-drag or Space-drag to pan.'),
      h('li', null, 'Click anything for its settings and readings; right-click for more.'),
      h('li', null, 'Press ? for every shortcut.')),
    h('div', { class: 'rt-actions' }, pick, h('button', { class: 'rt-btn', type: 'button', onclick: () => startTour('focus') }, 'Take the tour'),
      h('button', { class: 'rt-btn primary', type: 'button', onclick: hideWelcome }, 'Got it'))));
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireNews() {
  {
    document.getElementById('appVersion').textContent = APP_VERSION;
    const dlg = document.getElementById('newsDialog'), dot = document.getElementById('newsDot');
    // the Help button carries the What's new dot, its menu being shut
    new MutationObserver(() => { document.getElementById('helpDot').hidden = dot.hidden; }).observe(dot, { attributes: true, attributeFilter: ['hidden'] });
    const NEWS_KEY = 'jek-raytracer-news';
    try {
      const seen = localStorage.getItem(NEWS_KEY);
      // someone new has nothing to catch up on; someone back since an older version does
      if (!seen && !localStorage.getItem('jek-raytracer-welcomed')) localStorage.setItem(NEWS_KEY, APP_VERSION);
      else if (seen !== APP_VERSION && !EMBED) dot.hidden = false;
    } catch (err) { /* no store: no dot */ }
    document.getElementById('btnNews').addEventListener('click', () => {
      const body = document.getElementById('newsBody');
      const list = items => { const ul = h('ul'); for (const t of items) { const li = h('li'); li.innerHTML = t; ul.append(li); } return ul; };
      body.replaceChildren(...NEWS.flatMap(([v, date, items, top]) => {
        const head = h('h3', null, /^\d/.test(v) ? 'Version ' + v : v, h('span', null, date));
        // the version's highlights first, its every change folded beneath them
        if (top) return [head, list(top), h('details', { class: 'rt-news-all' }, h('summary', null, 'All ' + items.length + ' changes in ' + v), list(items))];
        return [head, list(items)];
      }));
      dot.hidden = true;
      try { localStorage.setItem(NEWS_KEY, APP_VERSION); } catch (err) { /* shown again: fine */ }
      dlg.showModal();
    });
    document.getElementById('newsClose').addEventListener('click', () => dlg.close());
  }

  {
    const dlg = document.getElementById('citeDialog');
    document.getElementById('btnCite').addEventListener('click', () => {
      const d = new Date(), iso = d.toISOString().slice(0, 10), year = APP_DATE.slice(-4);
      document.getElementById('citeText').value = 'JEK Systems (' + year + '). JEKray optical bench simulator, version ' + APP_VERSION + '. ' + CITE_URL + ' (accessed ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' }) + ' ' + d.getFullYear() + ').';
      document.getElementById('citeBib').value = '@software{jekray,\n  author  = {{JEK Systems}},\n  title   = {{JEKray}: optical bench simulator},\n  version = {' + APP_VERSION + '},\n  year    = {' + year + '},\n  url     = {' + CITE_URL + '},\n  urldate = {' + iso + '}\n}';
      dlg.showModal();
    });
    dlg.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      const ta = document.getElementById(b.dataset.copy);
      ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => toast('Copied'), () => { document.execCommand('copy'); toast('Copied'); });
    });
    document.getElementById('citeClose').addEventListener('click', () => dlg.close());
  }

  {
    const btn = document.getElementById('btnExp'), menu = document.getElementById('expMenu');
    const fill = () => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = expOn;
      const n = () => EXPERIMENTAL.filter(f => expPicked(f.key)).length;
      cb.addEventListener('change', () => { setExperimental(cb.checked); fill(); menu.querySelector('input').focus(); toast(expOn ? 'Experimental features on: ' + n() + ' of ' + EXPERIMENTAL.length + ' ticked' : 'Experimental features off'); });
      // each feature its own tick, kept whether the master switch is on or off; it acts only while it is on
      const row = f => {
        const t = h('input', { type: 'checkbox', 'data-exp': f.key });
        t.checked = expPicked(f.key);
        t.addEventListener('change', () => { setExperimental(null, { [f.key]: t.checked }); if (expOn) toast(f.name + (t.checked ? ' on' : ' off')); });
        return h('li', null, h('label', { class: 'rt-exppick' }, t, h('span', null, h('b', null, f.name), ': ', f.what)));
      };
      menu.replaceChildren(h('label', null, cb, 'Turn on experimental features'),
        h('p', null, 'Features still being built and checked, before they reach beta. They may change, or give wrong answers: nothing made with them is validated yet. Tick the ones you want; the switch above turns them all on or off together. The settings are kept in this browser.'),
        EXPERIMENTAL.length ? h('ul', { class: expOn ? null : 'off' }, ...EXPERIMENTAL.map(row))
          : h('p', { style: 'margin:0' }, 'There are none at the moment.'));
    };
    const show = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) { fill(); menu.querySelector('input').focus(); } };
    btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) show(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
    document.getElementById('expDot').hidden = !expOn;
  }

  {
    const dlg = document.getElementById('bugDialog'), note = document.getElementById('bugNote');
    const what = document.getElementById('bugWhat'), expect = document.getElementById('bugExpect'), withBench = document.getElementById('bugBench');
    const report = async () => {
      const lines = ['What happened:', what.value.trim() || '(not given)', '', 'What I expected:', expect.value.trim() || '(not given)', '', '---',
        'JEKray ' + APP_VERSION + ' (' + APP_DATE + ')', 'Browser: ' + navigator.userAgent,
        'Bench: ' + (project.name || 'Untitled') + ', ' + project.elements.length + ' parts on ' + project.benches.length + ' tab' + (project.benches.length === 1 ? '' : 's')];
      let link = null;
      if (withBench.checked) { try { link = shareBase() + '#p=' + await shareHash(); } catch (err) { link = null; } }
      return { lines, link };
    };
    const mailto = (subject, body) => 'mailto:' + BUG_TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.getElementById('btnBug').addEventListener('click', () => { note.textContent = ''; dlg.showModal(); what.focus(); });
    document.getElementById('bugClose').addEventListener('click', () => dlg.close());
    document.getElementById('bugSend').addEventListener('click', async () => {
      const { lines, link } = await report(), subject = 'JEKray bug: ' + (what.value.trim().split('\n')[0].slice(0, 60) || project.name || 'report');
      let url = mailto(subject, lines.concat(link ? ['', 'Link to the bench: ' + link] : []).join('\n'));
      if (link && url.length > BUG_MAILTO_MAX) {
        // too big to travel in the email link: without it, and ask for the file
        url = mailto(subject, lines.concat(['', 'The bench is attached as a .jekray file.']).join('\n'));
        note.replaceChildren('This bench is too big to travel in an email link. Please attach it to the email: ',
          h('button', { class: 'rt-link', type: 'button', onclick: () => saveFile() }, 'save it as a .jekray file'), ', then add that file to the email.');
      }
      window.location.href = url;
      if (!note.textContent) note.textContent = 'Your email app should open with the report. If nothing happens, use Copy the report and send it to ' + BUG_TO + '.';
    });
    document.getElementById('bugCopy').addEventListener('click', async () => {
      const { lines, link } = await report(), text = 'To: ' + BUG_TO + '\n\n' + lines.concat(link ? ['', 'Link to the bench: ' + link] : []).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Copied: paste it into an email to ' + BUG_TO); }
      catch (err) { toast('Could not copy here; please email ' + BUG_TO, true); }
    });
  }

  {
    const dlg = document.getElementById('snapsDialog'), box = document.getElementById('snapsList');
    const when = t => {
      const d = new Date(t), today = new Date().toDateString() === d.toDateString();
      const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return today ? 'Today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm;
    };
    const fill = () => {
      const list = readSnaps();
      box.replaceChildren(...(list.length ? list.map((S, i) => h('div', null,
        h('span', { class: 'when' }, when(S.t)),
        h('span', { class: 'what', title: S.name }, S.name || 'Untitled bench', ' ', h('small', null, S.n + ' part' + (S.n === 1 ? '' : 's') + ' · ' + S.why)),
        h('button', { class: 'rt-btn', type: 'button', onclick: () => {
          try { dlg.close(); openProjectData(JSON.parse(S.json), 'the version from ' + when(S.t).replace('Today ', '')); }
          catch (err) { toast('Could not open that version (' + err.message + ').', true); }
        } }, 'Open'))) : [h('p', null, 'Nothing kept yet. Copies appear here once you have been working for a few minutes.')]));
    };
    document.getElementById('btnSnaps').addEventListener('click', () => { fill(); dlg.showModal(); });
    document.getElementById('snapsClose').addEventListener('click', () => dlg.close());
  }

  {
    const dlg = document.getElementById('galleryDialog'), grid = document.getElementById('galleryGrid');
    const search = document.getElementById('gallerySearch');
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      grid.replaceChildren();
      for (const [group, beta, list] of EXAMPLES) {
        const hits = list.filter(([id, t, d, x]) => (!x || exp(x)) && (!q || (group + ' ' + t + ' ' + d).toLowerCase().includes(q)));
        if (!hits.length) continue;
        grid.append(h('h3', null, group, beta ? h('span', { class: 'rt-beta' }, 'Beta') : null),
          h('div', { class: 'rt-gcards' }, ...hits.map(([id, t, d, x]) => h('button', { class: 'rt-card', type: 'button', 'data-demo': id },
            h('img', { src: 'demos/thumbs/' + id + '.webp', alt: '', loading: 'lazy', width: 320, height: 200 }), h('b', null, t, x ? h('span', { class: 'rt-exp' }, 'Experimental') : !beta && BETA_EXAMPLES.has(id) ? h('span', { class: 'rt-beta' }, 'Beta') : null), h('span', null, d)))));
      }
      if (!grid.children.length) grid.append(h('p', { class: 'rt-gempty' }, 'No example matches “' + search.value.trim() + '”.'));
    };
    window.openGallery = () => { hideWelcome(); search.value = ''; fill(); dlg.showModal(); grid.scrollTop = 0; search.focus(); };
    search.addEventListener('input', fill);
    document.getElementById('btnExamples').addEventListener('click', () => openGallery());
    document.getElementById('galleryClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }                      // a click on the backdrop
      const b = e.target.closest('[data-demo]');
      if (b) { dlg.close(); openDemo(b.dataset.demo, true); }
    });
  }

  {
    const dlg = document.getElementById('helpDialog');
    document.getElementById('btnHelp').addEventListener('click', () => { hideWelcome(); dlg.showModal(); });
    document.getElementById('helpClose').addEventListener('click', () => dlg.close());
    document.addEventListener('keydown', e => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || typingIn(e.target) || document.querySelector('dialog[open]')) return;
      e.preventDefault(); hideWelcome(); dlg.showModal();
    });
  }

}
