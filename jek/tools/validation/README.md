# JEKray2D validation data

The reference data behind [the validation page](../jekray2d-validation.html), and the
scripts that made them. The page itself runs JEKray2D live against these files.

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
| `ref/rb-elecsus.json` | `scripts/rb_elecsus.py` | ElecSus (Zentile et al., Comput. Phys. Commun. 189, 162 (2015)) |
| `ref/faraday-elecsus.json` | `scripts/faraday_elecsus.py` | ElecSus: Faraday filters (Rb and Cs D2) and Rb in the hyperfine Paschen-Back regime, cell transmission and crossed-polariser transmission |
| `ref/rb-siddons-2008.json` | `scripts/siddons_fig8.py` | Siddons et al., J. Phys. B 41, 155004 (2008), Figure 8: measured transmission, read from the arXiv PDF's vector figure |
| `ref/dipole-traps.json` | `scripts/dipole_traps.py` | Safronova, Arora & Clark, PRA 73, 022505 (2006), Table I; tune-out wavelengths of Leonard et al. (2015) and Ratkata et al. (2021); Grimm et al. (2000) trap formulas |
| `ref/tweezers-hu.json` | `scripts/tweezers_hu.py` | Harada & Asakura's (1996) forces on a Rayleigh sphere, and the phase singularities of Hu et al.'s (2023) offset standing wave, on the exact (non-paraxial) Gaussian beams |
| `ref/gieseler-2012.json` | `scripts/gieseler_damping.py` | Gieseler et al., PRL 109, 103603 (2012), Figure 4: measured gas damping of a levitated 69 nm sphere, read from the arXiv PDF's vector figure; Epstein's (1924) free-molecular drag |
| `ref/spm-solitons.json` | `scripts/spm_solitons.py` | Exact solutions of the nonlinear Schroedinger equation: dispersionless self-phase modulation (Stolen & Lin 1978; Potasek, Agrawal & Pinault 1986), the fundamental soliton and Satsuma & Yajima's (1974) second-order soliton |
| `ref/treacy.json` | `scripts/treacy.py` | Treacy, IEEE J. Quantum Electron. 5, 454 (1969): the grating pair's phase, differentiated (needs mpmath) |
| `ref/boyd-kleinman.json` | `scripts/boyd_kleinman.py` | Boyd & Kleinman, J. Appl. Phys. 39, 3597 (1968): the focusing function by adaptive quadrature, and a PPLN bench |
| `ref/pdh-black.json` | `scripts/pdh_black.py` | Black, Am. J. Phys. 69, 79 (2001): the Pound-Drever-Hall reflected power and beats, every sideband order |

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
    ELECSUS=/path/to/ElecSus python scripts/rb_elecsus.py
    python scripts/siddons_fig8.py siddons.pdf          # arXiv:0805.1139, needs pymupdf
    python scripts/dipole_traps.py safronova.pdf        # arXiv:physics/0508087, needs pymupdf
    python scripts/gieseler_damping.py gieseler.pdf   # arXiv:1202.6435, needs pymupdf
    python scripts/spm_solitons.py
    python scripts/treacy.py
    python scripts/boyd_kleinman.py
    python scripts/pdh_black.py
    python scripts/diffraction_classics.py
    python scripts/fresnel_fp_self.py
    python scripts/coatings.py
    python scripts/tight_focus.py                    # about two minutes
    python scripts/bessel_axicon.py
    python scripts/mode_converter.py
    python scripts/tweezers_hu.py
    ELECSUS=/path/to/ElecSus python scripts/faraday_elecsus.py

## Rules

- A case's tolerance is set before its first run and is not changed to make it pass.
- Where a reference leaves a parameter out, the case says what was assumed.
- A failing case stays on the page until the model is fixed or the failure is recorded as a
  limit of the model.
