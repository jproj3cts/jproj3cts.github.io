---
layout: docs
title: Feedthrough
permalink: /jek/docs/jekray/fibre/feedthrough/
redirect_from: /jek/docs/jekray2d/fibre/feedthrough/
description: "The JEKray fibre feedthrough: one of a pair on two tabs, joined as if by one fibre."
element: { palette: Fibre, type: fcomp, kind: thru }
---

<p class="dx-lead">A pair of fibre feedthroughs joins a fibre network across two tabs. A fibre into one comes out at its partner on the other tab, and back, so a large network can be laid out over several benches and still be solved as one.</p>

## Ports

One port, **port**.

## The model

Two feedthroughs that share a pair name, on different tabs, are one joint. Light arriving at either leaves its partner as it arrived, with no loss, no phase and no delay: the fibres either side add their own, as if they were one fibre spliced together. The network is solved across all the tabs at once (see [Fibre optics: solving the network](/jek/docs/jekray/fibre/#solving-the-network)).

On the bench, each feedthrough's panel says where it leads, with a button to go to its partner. A feedthrough without a partner offers to make one, on any other tab or a new one.

## Settings

It has one setting, its **pair name**, shared by exactly two feedthroughs.

## Assumptions

<div class="dx-warn" markdown="1">
- The joint is ideal: no loss, reflection or delay.
- Exactly two feedthroughs share a name. A feedthrough with no partner joins nothing, and light reaching it is lost.
</div>

## Related

- [Link plane](/jek/docs/jekray/free-space/link/), which does the same for free space.
- [Electrical feedthrough](/jek/docs/jekray/electronics/feedthrough/), which does the same for signals.
- [Concepts: tabs and link planes](/jek/docs/jekray/concepts/#tabs-and-link-planes).
