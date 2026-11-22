---
layout: docs
title: Electrical feedthrough
permalink: /jek/docs/jekray/electronics/feedthrough/
redirect_from: /jek/docs/jekray2d/electronics/feedthrough/
description: "The JEKray electrical feedthrough: one of a pair on two tabs, carrying a signal between them as a bulkhead connector does."
element: { palette: Electronics, type: elec, kind: thru }
---

<p class="dx-lead">A pair of electrical feedthroughs carries signals between two tabs, as a bulkhead connector carries them through a wall. A photodiode on the optical bench can feed a lock-in on an electronics tab, and a generator there can drive a modulator back on the bench.</p>

## Ports

One connector. Wire an output into it, and draw as many wires out of it as you like, as with a node.

## The model

Two electrical feedthroughs that share a pair name, on different tabs, are one connector through the wall. A signal wired into either of them is there on both, unchanged: its DC level, its tones and its noise, with no loss, delay or bandwidth of its own. So a generator wired into a feedthrough reaches an oscilloscope wired from the same feedthrough, and one wired from its partner on the other tab.

If a signal is wired into both of the pair, each side reads the other side's: one pair then carries a signal out to another tab and a second one back, and each feedthrough says so in its panel. A feedthrough with no partner hands on what is wired into it on its own tab.

On the bench, each feedthrough's panel says where it leads, with a button to go to its partner. A feedthrough without a partner offers to make one, on any other tab or a new one.

A bench saved when a feedthrough had an **in** and an **out** opens as it was: the wires that left its out leave its one connector, and every reading is the same.

## Settings

It has one setting, its **pair name**, shared by exactly two electrical feedthroughs.

## Assumptions

<div class="dx-warn" markdown="1">
- The connection is ideal: no loss, delay, bandwidth limit or pick-up.
- Exactly two feedthroughs share a name. One with no partner carries nothing, and says so.
- A loop through a pair (an output fed back to its own input across the tabs) is not solved, as no loop in the electronics is.
</div>

## Related

- [Fibre feedthrough](/jek/docs/jekray/fibre/feedthrough/), which does the same for fibre.
- [Link plane](/jek/docs/jekray/free-space/link/), which does the same for free space.
- [Concepts: tabs and link planes](/jek/docs/jekray/concepts/#tabs-and-link-planes).
