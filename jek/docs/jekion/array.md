---
layout: docs
docs: jekion
title: The array and the solver
permalink: /jek/docs/jekion/array/
description: "The grid the potential is solved on: its symmetry, spacing, extent and boundary conditions, the multigrid solver, how accurate it is, and how to judge the staircase on curved electrodes."
---

<p class="dx-lead">The potential lives on a grid of nodes, the array. Its settings are in the Bench panel; this page says what they do and how the solver works.</p>

## The settings

**Symmetry**: planar, cylindrical or three-dimensional ([Concepts](/jek/docs/jekion/concepts/)). **Spacing h**: the distance between nodes, the same along every axis. **Extent**: x from and to, and y (or r) and z likewise. The node count is shown; the browser holds up to four million, and the spacing grows on its own if a file asks for more. **Fit the array round the electrodes** sets the extent to the electrodes with a margin.

**Edges.** Each face of the box has a boundary condition:

- **Open**: the potential runs out flat, ∂φ/∂n = 0. The field lines leave at right angles, as if the array went on; the default.
- **Grounded**: 0 V just beyond the edge, a wall at earth. Use it where there is one (a vacuum chamber) or to stop a lone electrode's field floating the whole array.
- **Mirror**: a plane of symmetry, the same as open to the solver; named so half a symmetric system can be solved. In a cylindrical array the axis is a mirror of its own accord.

## The solver

The Laplace equation ∇²φ = 0 is written by finite differences at each free node (the five- or seven-point star; in a cylindrical array the radial differences carry the 1/r term and the axis its regular form) with the nodes inside electrodes fixed at their voltages. It is solved by geometric multigrid: red-black Gauss–Seidel sweeps smooth each level, the residual goes down to a grid twice as coarse, whose correction comes back up (a W-cycle), and the first guess comes from solving the coarsest grids first. A coarse node is fixed when any fine node it stands for is, so no electrode goes missing on the way down however thin. Each electrode's basis potential is solved to a residual of 2 × 10⁻⁶ of its volt. A 400 × 200 cylindrical array solves in a few tens of milliseconds an electrode; a 100³ three-dimensional one in about half a second an electrode. The solving runs in a background thread, so the page stays responsive, and the bar on the bench says how far it has got.

## Accuracy

Between electrodes the potential is second-order accurate in the spacing. On a curved or slanted electrode the grid makes a staircase, and the field near it is first-order: the Node tests put a 3 mm sphere in a grounded shell and find the potential at r = 4.5 mm 7% low at h = 0.5 mm, 4.7% at 0.25 and 2.1% at 0.125, and a Paul trap's *q* 3% low at h = 0.2 mm (r₀ = 7 mm) and 1.5% at 0.1. Halve the spacing and see what moves; what does not move is right. The browser suite ([checks](/jek/tools/jekion-tests.html)) puts parallel plates, coaxial cylinders, concentric spheres and the hyperbolic trap against their closed forms.

## Plotting the potential

The Bench panel's **Potential plots** section plots the potential along the x axis, across it at a given x, along any line picked with two clicks on the bench (kept dashed on the bench while the plot stands), or along a flown particle's path against time, each with PNG and CSV buttons. The pointer's coordinates at the bottom of the bench read the potential and the field strength under it too.

## Between the nodes

The potential at a point is interpolated linearly in its cell (trilinearly in three dimensions). The field is not the interpolant's own slope (which would be constant across a cell and step at its faces): the gradient is taken at each corner of the cell by central differences on the nodes and interpolated linearly within the cell, so the field is continuous, a quadratic potential's field is exact, and a quadrupole's null is a true null rather than a floor of a cell's worth of field, which matters when a heavy particle is held at one. The flying step is kept to a fraction of a cell. The trap analysis takes second derivatives by a five-point difference at the node nearest the analysis point.
