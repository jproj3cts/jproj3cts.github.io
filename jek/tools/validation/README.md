# JEKray validation data

The reference data behind [the validation page](../jekray-validation.html), and the
scripts that made them. The page itself runs JEKray live against these files.

| File | Made by | Source |
|---|---|---|
| `ref/fresnel-fp-self.json` | `scripts/fresnel_fp_self.py` | Fresnel's equations and Brewster's angle (N-BK7, Schott's Sellmeier), the Fabry-Perot Airy function, Self's thin-lens transform of a Gaussian beam (Appl. Opt. 22, 658 (1983)) |
| `ref/kogelnik-li.json` | `scripts/kogelnik_li.py` | Kogelnik & Li, Appl. Opt. 5, 1550 (1966): closed forms for two-mirror resonators |
| `ref/fox-li.json` | `scripts/fox_li.py` | Fox & Li, Bell Syst. Tech. J. 40, 453 (1961): their integral equation, solved independently |
| `ref/fox-li-figure.json` | `scripts/fox_li_figure.py` | Fox & Li's Figure 8 (circular mirrors, TEM00), read from the 1961 journal's scan at archive.org |
| `ref/coatings.json` | `scripts/coatings.py` | Thin-film reflectance by the characteristic matrix (Abeles 1950), checked against Macleod's quarter-wave closed forms |
| `ref/tight-focus.json` | `scripts/tight_focus.py` | The vector focus of an ideal flat lens (Richards & Wolf 1959), by its exact vector angular spectrum, integrated independently |
| `ref/bessel-axicon.json` | `scripts/bessel_axicon.py` | The Bessel beam behind an axicon (Durnin et al. 1987), by the Fresnel integral of an ideal conical wave |
| `ref/mode-converter.json` | `scripts/mode_converter.py` | Beijersbergen et al.'s (1993) pi/2 cylindrical-lens mode converter: the HG1,0 it makes from LG0,1 |
| `ref/diffraction-classics.json` | `scripts/diffraction_classics.py` | Poisson's spot (Fresnel 1818), the Airy pattern (Airy 1835) and Young's slits (Young 1804), from the Fresnel-Kirchhoff integral |
| `ref/lenses-optiland.json` | `scripts/lenses_optiland.py` | Optiland 0.6 real-ray traces (github.com/HarrisonKramer/optiland) |
| `ref/seidel.json` | `scripts/seidel.py` | Welford, Aberrations of Optical Systems (1986): Seidel sums for a singlet and a Cooke triplet, the higher orders from exact meridional rays fitted as JEKray fits, and Maréchal's Strehl ratio |
| `ref/rb-elecsus.json` | `scripts/rb_elecsus.py` | ElecSus (Zentile et al., Comput. Phys. Commun. 189, 162 (2015)) |
| `ref/faraday-elecsus.json` | `scripts/faraday_elecsus.py` | ElecSus: Faraday filters (Rb and Cs D2) and Rb in the hyperfine Paschen-Back regime, cell transmission and crossed-polariser transmission |
| `ref/rb-siddons-2008.json` | `scripts/siddons_fig8.py` | Siddons et al., J. Phys. B 41, 155004 (2008), Figure 8: measured transmission, read from the arXiv PDF's vector figure |
| `ref/dipole-traps.json` | `scripts/dipole_traps.py` | Safronova, Arora & Clark, PRA 73, 022505 (2006), Table I; tune-out wavelengths of Leonard et al. (2015) and Ratkata et al. (2021); Grimm et al. (2000) trap formulas |
| `ref/sat-abs.json` | `scripts/sat_abs.py` | Steck's Rb 87 D-line data (hyperfine levels, saturation intensity) and the textbook Lamb-dip width (Demtröder) |
| `ref/davll-elecsus.json` | `scripts/davll_elecsus.py` | ElecSus: the DAVLL signal (S3) of natural Rb D2 at 50, 100 and 200 G (Corwin et al. 1998's scheme) |
| `ref/tweezers-hu.json` | `scripts/tweezers_hu.py` | Harada & Asakura's (1996) forces on a Rayleigh sphere, and the phase singularities of Hu et al.'s (2023) offset standing wave, on the exact (non-paraxial) Gaussian beams |
| `ref/gieseler-2012.json` | `scripts/gieseler_damping.py` | Gieseler et al., PRL 109, 103603 (2012), Figure 4: measured gas damping of a levitated 69 nm sphere, read from the arXiv PDF's vector figure; Epstein's (1924) free-molecular drag |
| `ref/spm-solitons.json` | `scripts/spm_solitons.py` | Exact solutions of the nonlinear Schroedinger equation: dispersionless self-phase modulation (Stolen & Lin 1978; Potasek, Agrawal & Pinault 1986), the fundamental soliton and Satsuma & Yajima's (1974) second-order soliton |
| `ref/treacy.json` | `scripts/treacy.py` | Treacy, IEEE J. Quantum Electron. 5, 454 (1969): the grating pair's phase, differentiated (needs mpmath) |
| `ref/boyd-kleinman.json` | `scripts/boyd_kleinman.py` | Boyd & Kleinman, J. Appl. Phys. 39, 3597 (1968): the focusing function by adaptive quadrature, and a PPLN bench |
| `ref/rigrod.json` | `scripts/rigrod.py` | Rigrod, J. Appl. Phys. 36, 2487 (1965): a laser's output against its output coupling, checked by integrating the two saturating waves |
| `ref/pdh-black.json` | `scripts/pdh_black.py` | Black, Am. J. Phys. 69, 79 (2001): the Pound-Drever-Hall reflected power and beats, every sideband order |
| `ref/photonic-circuits.json` | `scripts/photonic_circuits.py` | Closed forms for rings (Bogaerts et al. 2012; Yariv 2000), a Mach-Zehnder and a directional coupler; two small circuits solved by SAX 0.18.2 (github.com/flaport/sax) |
| `ref/prism-dispersion.json` | `scripts/prism_dispersion.py` | A prism's deviation and its minimum (Hecht, Optics, 4th ed., §5.5.1), N-BK7 and N-SF11 from Schott's Sellmeier coefficients |
| `ref/grating-equation.json` | `scripts/grating_equation.py` | The grating equation (Born & Wolf, §8.6.1): every propagating order, Littrow, the angular dispersion |
| `ref/conic-mirrors.json` | `scripts/conic_mirrors.py` | A spherical mirror's exact longitudinal aberration (Hecht, §5.4) and the foci of the paraboloid, ellipsoid and hyperboloid, checked by exact rays |
| `ref/jones-calculus.json` | `scripts/jones_calculus.py` | Jones, J. Opt. Soc. Am. 31, 488 (1941): polarisers and wave plates as 2 x 2 matrices, Malus's law |
| `ref/wollaston.json` | `scripts/wollaston.py` | A calcite Wollaston prism's two beams by exact refraction, calcite's indices from Ghosh, Opt. Commun. 163, 95 (1999) |
| `ref/tir-rhomb.json` | `scripts/tir_rhomb.py` | Total internal reflection's phase between s and p, and Fresnel's rhomb (Born & Wolf, §1.5.4), N-BK7 |
| `ref/corrugated-horn.json` | `scripts/corrugated_horn.py` | Wylde, IEE Proc. H 131, 258 (1984), and Goldsmith, Quasioptical Systems (1998), ch. 6–7: the HE11 field's fundamental Gaussian, a corrugated receiver's coupling and the far field, by quadrature |
| `ref/gaussian-coupling.json` | `scripts/gaussian_coupling.py` | Goldsmith, Quasioptical Systems (1998), ch. 4: two Gaussian horns' coupling against separation, waist mismatch, offset and tilt |
| `ref/fibre-ring-coherence.json` | `scripts/fibre_ring_coherence.py` | A fibre ring's through power (Yariv, Electron. Lett. 36, 321 (2000)); a fibre Mach-Zehnder's visibility against a Lorentzian or Gaussian laser line (Goodman, Statistical Optics (1985), ch. 5) |
| `ref/aom-heterodyne.json` | `scripts/aom_heterodyne.py` | An AOM's Bragg angle, its shift seen as a heterodyne beat (single and double pass), and its sin² efficiency against drive |
| `ref/detection-electronics.json` | `scripts/detection_electronics.py` | Shot (Schottky 1918), Johnson (Johnson; Nyquist 1928) and amplifier noise over a single pole's noise bandwidth; Butterworth filters (scipy.signal); a lock-in's ENBW, noise and phase |
| `ref/breit-rabi.json` | `scripts/breit_rabi.py` | Breit & Rabi, Phys. Rev. 38, 2082 (1931): the ground-state levels of 87Rb and Cs in a field, with Steck's constants; the clock shifts checked against Steck's 575.15 and 427.45 Hz/G² |
| `ref/lattice.json` | `scripts/lattice.py` | Grimm et al. (2000), the standing-wave trap: a retro-reflected 1064 nm beam's depth and trap frequencies for 87Rb, with Safronova et al.'s polarisability |
| `ref/prism-pair.json` | `scripts/prism_pair.py` | Fork, Martinez & Gordon, Opt. Lett. 9, 150 (1984): a Brewster pair of N-SF10 prisms by exact ray trace, GDD and TOD against separation, and their closed form for the slope |
| `ref/glass-pulse.json` | `scripts/glass_pulse.py` | Sellmeier GDD and TOD (Malitson 1965; Schott N-SF10) and a Gaussian pulse's duration after the glass, by Fourier transform |
| `ref/ppln-tuning.json` | `scripts/ppln_tuning.py` | Gayer et al., Appl. Phys. B 91, 343 (2008) and Boyd & Kleinman (1968): the temperature tuning curve of SHG in 20 mm of MgO:PPLN |
| `ref/cavity-basics.json` | `scripts/cavity_basics.py` | The Airy sum of round trips (Born & Wolf §7.6): free spectral range (group path), finesse, linewidth and build-up of two linear cavities and a ring |
| `ref/talbot.json` | `scripts/talbot.py` | The Talbot effect (Rayleigh, Phil. Mag. 11, 196 (1881)): a sinusoidal amplitude grating's three orders as tilted Gaussian beams in closed form (Goodman, Introduction to Fourier Optics, ch. 4) |
| `ref/phase-grating.json` | `scripts/phase_grating.py` | A sinusoidal phase grating (Goodman, Introduction to Fourier Optics, ch. 4): each order's share of the power, J_n(beta)^2 by the Jacobi-Anger expansion, the orders added as tilted Gaussian beams in closed form |
| `ref/fresnel-edge.json` | `scripts/fresnel_edge.py` | Fresnel diffraction at a straight edge (Born & Wolf, Principles of Optics, section 8.7): a Gaussian beam past a half-plane in closed form, an error function of complex argument, checked against Fresnel's integrals for a plane wave |
| `ref/n-slits.json` | `scripts/n_slits.py` | The Fraunhofer pattern of 2, 5 and 10 slits (Born & Wolf, section 8.6): the Fourier transform of the light leaving the slits by Gauss-Legendre quadrature, checked against the textbook grating form |
| `ref/embedded-gaussian.json` | `scripts/embedded_gaussian.py` | Siegman's embedded Gaussian (Lasers, ch. 17; Proc. SPIE 1224, 2 (1990)): an M² = 4 beam's width in free space and through a lens, by the embedded q and by the second-moment matrix law |
| `ref/fibre-coupling.json` | `scripts/fibre_coupling.py` | Joyce & DeLoach, Appl. Opt. 23, 4187 (1984): a Gaussian beam's overlap with a single-mode fibre's mode (Marcuse's) against offset, tilt, waist and axial offset, in closed form |
| `ref/fibre-mfd.json` | `scripts/fibre_mfd.py` | Marcuse, Bell Syst. Tech. J. 56, 703 (1977): the mode-field radius against V, and the exact LP01 mode's best Gaussian, solved independently |
| `ref/abcd-beams.json` | `scripts/abcd_beams.py` | Kogelnik & Li's ABCD law: a Gaussian beam through a thick N-BK7 lens both ways round, and off a concave mirror at 15° (Siegman, Lasers, ch. 15) |
| `ref/collimator-pair.json` | `scripts/collimator_pair.py` | Fibre to fibre through two collimating lenses: the beams' overlap in closed form against the gap, the focal lengths and an offset |

## Making them again

Python 3.11 with numpy and scipy (`fox_li.py`), optiland 0.6 (`lenses_optiland.py`), and for
`rb_elecsus.py` a copy of ElecSus from github.com/jameskeaveney/ElecSus with sympy, lmfit,
psutil and matplotlib installed, its folder given as `ELECSUS=/path/to/ElecSus`. Recent
SciPy no longer has `scipy.linalg.kron`; in ElecSus's `libs/sz_lsi.py`, import `kron` from
numpy instead.

    pip install numpy scipy optiland sympy lmfit psutil matplotlib
    python scripts/kogelnik_li.py
    python scripts/fox_li.py
    python scripts/fox_li_figure.py fl13.png          # page 466 of the archive.org scan, needs Pillow
    python scripts/lenses_optiland.py
    python scripts/seidel.py                         # needs optiland (for its glass data and the triplet)
    ELECSUS=/path/to/ElecSus python scripts/rb_elecsus.py
    python scripts/siddons_fig8.py siddons.pdf          # arXiv:0805.1139, needs pymupdf
    python scripts/dipole_traps.py safronova.pdf        # arXiv:physics/0508087, needs pymupdf
    python scripts/gieseler_damping.py gieseler.pdf   # arXiv:1202.6435, needs pymupdf
    python scripts/spm_solitons.py
    python scripts/treacy.py
    python scripts/boyd_kleinman.py
    python scripts/pdh_black.py
    python scripts/photonic_circuits.py              # needs sax (pip install sax)
    python scripts/rigrod.py
    python scripts/diffraction_classics.py
    python scripts/fresnel_fp_self.py
    python scripts/coatings.py
    python scripts/tight_focus.py                    # about two minutes
    python scripts/bessel_axicon.py
    python scripts/mode_converter.py
    python scripts/tweezers_hu.py
    ELECSUS=/path/to/ElecSus python scripts/faraday_elecsus.py
    ELECSUS=/path/to/ElecSus python scripts/davll_elecsus.py
    python scripts/sat_abs.py
    python scripts/prism_dispersion.py
    python scripts/grating_equation.py
    python scripts/conic_mirrors.py
    python scripts/jones_calculus.py
    python scripts/wollaston.py
    python scripts/tir_rhomb.py
    python scripts/corrugated_horn.py
    python scripts/gaussian_coupling.py
    python scripts/fibre_ring_coherence.py
    python scripts/aom_heterodyne.py
    python scripts/detection_electronics.py
    python scripts/breit_rabi.py
    python scripts/lattice.py
    python scripts/prism_pair.py
    python scripts/glass_pulse.py
    python scripts/ppln_tuning.py
    python scripts/cavity_basics.py
    python scripts/talbot.py
    python scripts/phase_grating.py
    python scripts/fresnel_edge.py
    python scripts/n_slits.py
    python scripts/embedded_gaussian.py
    python scripts/fibre_coupling.py
    python scripts/fibre_mfd.py
    python scripts/abcd_beams.py
    python scripts/collimator_pair.py

## Rules

- A case's tolerance is set before its first run and is not changed to make it pass.
- Where a reference leaves a parameter out, the case says what was assumed.
- A failing case stays on the page until the model is fixed or the failure is recorded as a
  limit of the model.
