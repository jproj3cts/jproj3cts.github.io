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

Pages under `jek/docs/` are Markdown rendered by Jekyll, so they appear only on
the published site or in a local Jekyll build.

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
