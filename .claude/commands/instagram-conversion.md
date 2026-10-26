---
description: Standing instructions for JEKray's Instagram posts, for turning views into visits, sign-ins and JEKrayPro.
---

# JEKray on Instagram: from views to the app

Follow these rules for every JEKray post, reel, story and caption you write. Your job is to turn views into visits to the app, sign-ins and JEKrayPro subscriptions, and every post must be tagged so the usage report can tell which posts did that. $ARGUMENTS

## The one link

Instagram captions are not clickable. The only ways in are **the link in bio** and **link stickers in stories**, so every post must point at one of them.

- **Bio link** (always this, never the home page or the product page):
  `https://jeksys.net/jek/tools/jekray.html?src=ig-bio`
- **Per post**: each reel gets its own deep link that opens the bench shown in the video, with its own tag:
  `https://jeksys.net/jek/tools/jekray.html?src=ig-<slug>#demo=<example-id>`
  - `<slug>` is short, lower case, letters, digits and hyphens only, at most 21 characters after `ig-` (24 in all), and unique to the post: `ig-michelson`, `ig-czerny-turner`, `ig-poisson-spot-2`. Never reuse a slug: add `-2`, `-3`.
  - `<example-id>` is an example's id from `EXAMPLES` in `jek/tools/jekray/src/ui/news.js` (for example `michelson`, `youngs-double-slit`, `czerny-turner`). Check that the id exists before posting. If the video shows a bench that is not an example, leave out `#demo=` and the link opens the default bench.
  - Put this link on a **link sticker in a story** posted the same day as the reel, with the sticker reading what it opens: "Open this bench", "Try the interferometer".
- **Add the reel's bench to the app's Instagram list** the same day: a copy of the bench the reel shows goes at the top of `REELS` in `jek/tools/jekray/src/ui/reels.js`, which lists the latest reels' benches to visitors who come from Instagram.
  - The entry: `{ id: '<slug>', title: 'What the reel shows', line: 'One short line on what to try.', bench: { … } }`, where `<slug>` is the post's tag (`ig-michelson`) and `bench` is the .jekray file's JSON (File › Save, then the file's text). Use `demo: '<example-id>'` instead of `bench` only when the reel shows an example exactly as it ships (that also gives the entry its picture).
  - The bench must be the one in the video: same parts and settings, so the figures in the post match what opens.
  - Then rebuild (`cd jek/tools/jekray && node build.mjs`), run `node --test test/node/landing.test.mjs`, and commit on a branch as usual (never straight to main).
- Keep a log at the end of the post's notes of each slug, date and example id, so the report's "By source" rows can be matched to posts.

## Calls to action

- Every caption ends with one plain call to action naming where the link is: "Open this bench in your browser: link in bio." or "Try it: link in today's story."
- Say it is free and needs nothing installed: "Free, in the browser, no download, no account needed to start."
- Say it is **best on a computer**. Most viewers are on a phone; the app works there, but its welcome note on a phone offers "Email me a link for my computer". Mention that once in a while: "On your phone? Open the link and email it to yourself for later."
- JEKrayPro comes after the free tool, never instead of it. When a reel shows what it adds (cloud saving with history, short share links, the optimiser, tolerancing, design reports, drawings), say so plainly: "Saving to the cloud and share links are JEKrayPro."
- One call to action a post. Do not stack "follow, like, share, link in bio".

## What the app does with the visit

So you can describe it accurately:
- The tag in the link is counted against the post (`from`), and so is what the visit goes on to do (`goal`): save, share, email a link from a phone, sign in, create an account, open Subscribe, subscribe. The tag is kept in that browser for 30 days, so a return visit still counts for the post.
- Signed out, pressing **Share** asks the person to sign in (short links are JEKrayPro's), and the first **Save** in a week offers sign-in for cloud saving.
- Report with: `node jek-api/scripts/usage.mjs --days 30 --html report.html` (needs `JEK_OPS_TOKEN`). Its "By source" table has one row per tag, with visits, return visits and each step. Judge posts by sign-ins and accounts, not views.

## Rules that always hold

- No GitHub links, ever, anywhere.
- Never name makers or suppliers in posts (no vendor names for parts, catalogues or imports).
- Never name other optics software. Zemax/OpticStudio may be mentioned only as a plain fact (for example "imports .zmx files"); never compare with it, and never name any other program.
- Say what JEKray does, never how it is built (no libraries, languages, engines, architecture or code).
- Physics in a post must be right: check figures against the bench in the video.
- RF lenses: say "density", not "infill"; "Manufacturable"; no printing references; JEK Systems makes and quotes them, and there are no print-ready files.
- No promises of features that are not in the app, no prices other than those the app shows, and no claims about other people's results.
- Do not ask for or collect anyone's personal details in comments or messages; point them to the app or to support@jeksys.net.
