---
layout: docs
docs: jekcad
title: Files, the cloud and exports
permalink: /jek/docs/jekcad/files/
description: "Saving and opening .jekcad files, autosave, part studios in the cloud on JEKsuite, STEP import, and STEP and STL export, with what each needs."
---

<p class="dx-lead">A part studio is kept as its feature list, not its geometry. The file is small, and the part is rebuilt from it when you open it.</p>

## .jekcad files

**Save** (Ctrl+S; **File › Save as .jekcad**) downloads the part studio as a .jekcad file: its variables, its features in order, the rollback bar, and its parts' names, colours and materials. **File › Open** opens one, as does dropping it on the view. Saving and opening need no account.

**File › Share a link** makes a link to the part studio as it is now. Signed in, the link is short (`jeksys.net/c/` and ten letters) and the part studio is kept with your account. JEKsuite's My links lists your links, to delete. A free account keeps three short links at once. When a short link cannot be made, the part studio is written into the link itself, which makes a long link for a big part studio. Anyone with either link opens it to look, turn and measure. Making a link needs a free account, and so does changing what a link opens.

Changing a part studio (sketching, adding or editing features, typing dimensions) needs a free account. Looking at one does not.

A .jekcad file is JSON. Fields a newer JEKcad adds are given defaults when an older file opens.

## Autosave

The part studio you are working on is kept in this browser as you work. When you come back, it is where you left it. Undo goes back through every change since the page opened.

## The cloud and JEKsuite

Signed in with JEKrayPro, or as a member of a team with a plan, **File › Save to cloud** puts the part studio in your workspace or a team's. From then on it saves as you work and keeps its history. Your part studios are listed on [JEKsuite](/jek/tools/jeksuite.html#app=jekcad) with your JEKray, JEKion and JEKfilm work. Open one there and it opens in JEKcad. **New › JEKcad part studio** in JEKsuite starts one. If someone else has it open, JEKcad says who, and you can look, take over, or carry on in a copy.

A part studio in the cloud can be at most 2 MB. An imported STEP file is kept inside the part studio, so a large one can take it over that limit. Keep those as .jekcad files.

## STEP import

**File › Import STEP**, or dropping a .step file on the view, adds an **Import** feature at the rollback bar. Each solid in the file becomes a part. You can fillet, cut and pattern it like any other part. Its faces are named by their order in the file.

## Exports

| Export | What it holds |
|---|---|
| **Export all parts as STEP** | Every part, as solids, in millimetres (AP242) |
| **Export all parts as STL** | Every part, as binary STL triangles |
| A part's **⋯ › Export as STEP / STL** | That part alone |

Exports need a free account. Sign in from the top right; your work stays in the page while you do.

## What each thing needs

| What you do | What it needs |
|---|---|
| Model; save and open .jekcad files; import STEP | Nothing |
| Export STEP or STL | A free account |
| Keep part studios in the cloud, with their history | JEKrayPro, or a team with a plan |
