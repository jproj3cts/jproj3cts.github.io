# JEKray2D validation data

The reference data behind [the validation page](../jekray2d-validation.html), and the
scripts that made them. The page itself runs JEKray2D live against these files.

| File | Made by | Source |
|---|---|---|
| `ref/kogelnik-li.json` | `scripts/kogelnik_li.py` | Kogelnik & Li, Appl. Opt. 5, 1550 (1966): closed forms for two-mirror resonators |
| `ref/fox-li.json` | `scripts/fox_li.py` | Fox & Li, Bell Syst. Tech. J. 40, 453 (1961): their integral equation, solved independently |
| `ref/lenses-optiland.json` | `scripts/lenses_optiland.py` | Optiland 0.6 real-ray traces (github.com/HarrisonKramer/optiland) |
| `ref/rb-elecsus.json` | `scripts/rb_elecsus.py` | ElecSus (Zentile et al., Comput. Phys. Commun. 189, 162 (2015)) |
| `ref/rb-siddons-2008.json` | `scripts/siddons_fig8.py` | Siddons et al., J. Phys. B 41, 155004 (2008), Figure 8: measured transmission, read from the arXiv PDF's vector figure |
| `ref/dipole-traps.json` | `scripts/dipole_traps.py` | Safronova, Arora & Clark, PRA 73, 022505 (2006), Table I; tune-out wavelengths of Leonard et al. (2015) and Ratkata et al. (2021); Grimm et al. (2000) trap formulas |
| `ref/spm-solitons.json` | `scripts/spm_solitons.py` | Exact solutions of the nonlinear Schroedinger equation: dispersionless self-phase modulation (Stolen & Lin 1978; Potasek, Agrawal & Pinault 1986), the fundamental soliton and Satsuma & Yajima's (1974) second-order soliton |
| `ref/treacy.json` | `scripts/treacy.py` | Treacy, IEEE J. Quantum Electron. 5, 454 (1969): the grating pair's phase, differentiated (needs mpmath) |

## Making them again

Python 3.11 with numpy and scipy (`fox_li.py`), optiland 0.6 (`lenses_optiland.py`), and for
`rb_elecsus.py` a copy of ElecSus from github.com/jameskeaveney/ElecSus with sympy, lmfit,
psutil and matplotlib installed, its folder given as `ELECSUS=/path/to/ElecSus`. Recent
SciPy no longer has `scipy.linalg.kron`; in ElecSus's `libs/sz_lsi.py`, import `kron` from
numpy instead.

    pip install numpy scipy optiland sympy lmfit psutil matplotlib
    python scripts/kogelnik_li.py
    python scripts/fox_li.py
    python scripts/lenses_optiland.py
    ELECSUS=/path/to/ElecSus python scripts/rb_elecsus.py
    python scripts/siddons_fig8.py siddons.pdf          # arXiv:0805.1139, needs pymupdf
    python scripts/dipole_traps.py safronova.pdf        # arXiv:physics/0508087, needs pymupdf
    python scripts/spm_solitons.py
    python scripts/treacy.py

## Rules

- A case's tolerance is set before its first run and is not changed to make it pass.
- Where a reference leaves a parameter out, the case says what was assumed.
- A failing case stays on the page until the model is fixed or the failure is recorded as a
  limit of the model.
