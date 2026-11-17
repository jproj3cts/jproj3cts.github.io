# Contributing

This repository is the jeksys.net site and the JEK apps (JEKray, JEKion, JEKfilm, JEKcad, JEKsuite) with their API.
Changes reach `main`, and so the live site, only through a pull request that the owner (jproj3cts) reviews.

## Getting set up

1. Accept the repository invitation from GitHub (by email, or at github.com/notifications).
2. Connect your GitHub account to Claude at https://claude.ai/connect-github. The Claude GitHub App is already
   installed on this repository.
3. Start a Claude Code session on `jproj3cts/jproj3cts.github.io`. Claude reads `CLAUDE.md`, the working notes,
   and follows them.

## Running the apps on your own computer

You need Git, Node 22 and Python 3. Clone the repository, then from its top folder:

```sh
python3 -m http.server 8000
```

Open one of these in your browser:

| Page | What it is |
|---|---|
| http://localhost:8000/jek/tools/jekray-dev.html | JEKray straight from its source files: edit a file under `jek/tools/jekray/src/`, reload, and see the change, with no build |
| http://localhost:8000/jek/tools/jekray.html | JEKray as it is published (the built page) |
| `jekion-dev.html`, `jekfilm-dev.html`, `jekcad-dev.html`, `jeksuite-dev.html` | The other apps the same way, from their own `src/` folders |

Use the `-dev` page while you work. Before committing, build the page so the published one matches
(`node build.mjs` in that app's folder, for example `jek/tools/jekray`), and run its tests.

Run locally, the apps look for the accounts API on your own computer (`localhost:8787`). It is not running, so
signing in and the cloud do not work, and everything an account would allow is open to you instead: saving, exports,
the optimiser, scripts. Nothing you do locally reaches the live site or anyone's account.

The site's own pages (the `jek/` pages and the docs) are built by Jekyll and show `{% include %}` tags when served
this way; the README's "Previewing" section says how to build them.

## Making a change

1. Ask Claude for the change. It works on its own branch (`claude/…`), never on `main`.
2. Claude builds the pages it touches, runs the tests, and commits under your name.
3. Ask Claude to open a pull request. The template asks for the test counts and anything the deploy needs.
4. CI runs on the pull request (about 7 minutes). It must pass before the pull request can merge.
5. The owner reviews and merges. Every pull request needs the owner's approval (`.github/CODEOWNERS`), so nothing
   reaches `main` without it.

The API and the shop worker are deployed by the owner by hand. If your change needs a deploy, a migration or a new
secret, say so in the pull request.

## Rules

- Never push to `main`, force-push, or rewrite a branch someone else is working on.
- Commit under your own name and GitHub noreply address.
- Never put API keys, tokens or other secrets in the repository.
- Writing for the site's pages follows the "Site writing" section of `CLAUDE.md`.

## Running the tests yourself

From `jek/tools/jekray`: `node test/run.mjs` (what your change touches) or `node test/run.mjs --full` (everything).
Each other app (`jek/tools/jekion`, `jekfilm`, `jekcad`, `jeksuite`) has its own `node test/run.mjs`, and the API
`npm test` in `jek-api`.
