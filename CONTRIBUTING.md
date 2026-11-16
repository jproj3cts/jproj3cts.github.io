# Contributing

This repository is the jeksys.net site and the JEK apps (JEKray, JEKion, JEKfilm, JEKcad, JEKsuite) with their API.
Changes reach `main`, and so the live site, only through a pull request that the owner (jproj3cts) reviews.

## Getting set up

1. Accept the repository invitation from GitHub (by email, or at github.com/notifications).
2. Connect your GitHub account to Claude at https://claude.ai/connect-github. The Claude GitHub App is already
   installed on this repository.
3. Start a Claude Code session on `jproj3cts/jproj3cts.github.io`. Claude reads `CLAUDE.md`, the working notes,
   and follows them.

## Making a change

1. Ask Claude for the change. It works on its own branch (`claude/…`), never on `main`.
2. Claude builds the pages it touches, runs the tests, and commits under your name.
3. Ask Claude to open a pull request. The template asks for the test counts and anything the deploy needs.
4. CI runs on the pull request (about 7 minutes). It must pass before the pull request can merge.
5. The owner reviews and merges. Changes to accounts, billing, the API, CI and the legal pages always need the
   owner's review (`.github/CODEOWNERS`).

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
