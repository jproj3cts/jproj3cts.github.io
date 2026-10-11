---
layout: docs
title: Electrical feedthrough
permalink: /jek/docs/jekray2d/electronics/feedthrough/
description: "The JEKray2D electrical feedthrough: one of a pair on two tabs, carrying a signal between them as a bulkhead connector does."
element: { palette: Electronics, type: elec, kind: thru }
---

<p class="dx-lead">A pair of electrical feedthroughs carries signals between two tabs, as a bulkhead connector carries them through a wall. A photodiode on the optical bench can feed a lock-in on an electronics tab, and a generator there can drive a modulator back on the bench.</p>

## Ports

Two: **in** and **out**.

## The model

Two electrical feedthroughs that share a pair name, on different tabs, are one connector. What is wired into one's **in** comes out of its partner's **out**, unchanged: its DC level, its tones and its noise, with no loss, delay or bandwidth of its own. It works both ways at once, so one pair can carry a signal out to another tab and a second signal back.

On the bench, each feedthrough's panel says where it leads, with a button to go to its partner. A feedthrough without a partner offers to make one, on any other tab or a new one. An unwired **in** is fine: its partner's **out** then carries nothing.

## Settings

It has one setting, its **pair name**, shared by exactly two electrical feedthroughs.

## Assumptions

<div class="dx-warn" markdown="1">
- The connection is ideal: no loss, delay, bandwidth limit or pick-up.
- Exactly two feedthroughs share a name. One with no partner carries nothing, and says so.
- A loop through a pair (an output fed back to its own input across the tabs) is not solved, as no loop in the electronics is.
</div>

## Related

- [Fibre feedthrough](/jek/docs/jekray2d/fibre/feedthrough/), which does the same for fibre.
- [Link plane](/jek/docs/jekray2d/free-space/link/), which does the same for free space.
- [Concepts: tabs and link planes](/jek/docs/jekray2d/concepts/#tabs-and-link-planes).
