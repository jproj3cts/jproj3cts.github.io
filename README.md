# jeksys.net

The JEK Systems website, with the μRPG site beside it. Published with GitHub
Pages from this repository's default branch; `CNAME` carries the domain.

| | | |
|---|---|---|
| **JEK Systems** | `/jek/` | Products, calculators, JEKray and its documentation |
| **μRPG** | `/urpg/` | The tabletop game, its catalogue and its tools |

The two sides share nothing: separate stylesheets, assets and navigation.
If something is needed on both, copy it rather than linking across.

## Previewing

Links are root-relative (`/jek/...`), so the site must be served from the
repository root rather than opened from `file://`:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

That shows μRPG as published, but not the JEK side: its pages are built by
Jekyll (the docs are Markdown, and the HTML pages pull in the shared nav and
the `jek.css` stamp, so served raw they show `{% include %}` tags). Preview
those with a local Jekyll build, using the `github-pages` gem so the versions
match Pages:

```sh
# Gemfile somewhere outside the repo: gem "github-pages"; gem "webrick"
LANG=C.UTF-8 PAGES_REPO_NWO=jproj3cts/jproj3cts.github.io \
  bundle exec jekyll serve -s /path/to/this/repo   # then open http://localhost:4000/jek/
```

Without access to the GitHub API the metadata plugin may stop the build; it is
not used by any page, so stub it out (e.g. preload a file that redefines
`Jekyll::GitHubMetadata::Client#internet_connected?` to return false).

## Navigation and the stylesheet stamp

The JEK nav bar lives once, in `_includes/site-nav.html`; pages use
`{% include site-nav.html %}`. Every page links
`/jek/assets/css/jek.css?v={{ site.css_v }}`, with `css_v` set in `_config.yml`.
For Jekyll to run Liquid on a plain HTML page it needs front matter, so those
pages start with a `---` / comment / `---` block; keep it. A new JEK page
copies that block, the include and the stamp from an existing one, and must not
contain a literal `{{` or `{%` elsewhere (wrap such text in
`{% raw %}…{% endraw %}`).

Two kinds of file are served without a build and keep literal copies:
`jek/tools/jekray-tests.html` (opened unbuilt by the test runner) and the JEKray
page (`jek/tools/jekray/page.html`, built into `jekray.html`). After changing
the nav or `css_v`, update those by hand (and rebuild JEKray);
`jek/tools/jekray/test/node/site-nav.test.mjs` fails until they match.
`card/` and `urpg/` have navs of their own and are not part of this.

## Conventions

- Internal links start with `/jek/` or `/urpg/`, never `../`.
- Directories with an `index.html` are linked as directories: `/jek/calculators/`.
- Filenames are lowercase and hyphenated. The host is case-sensitive.
- `_config.yml` lists what is kept out of the published site.
- The root `index.html` forwards to `/jek/`; `404.html` forwards old addresses.

## Services

The two server-side parts are deployed separately and have their own notes:
`jek-api/README.md` for the JEKray cloud service and `worker/SETUP.md` for the
μRPG store's fulfilment. Secrets are never committed; each README says how to
set them.
