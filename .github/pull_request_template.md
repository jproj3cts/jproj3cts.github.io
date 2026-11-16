## What changes

<!-- One or two sentences: what a person using the site or the apps will notice. -->

## Tests

<!-- After merging the latest main into this branch and rebuilding, the counts from each suite you ran. -->

| Suite | Result |
|---|---|
| JEKray (`node test/run.mjs --full`) | |
| JEKion / JEKfilm / JEKcad / JEKsuite (`node test/run.mjs`), if touched | |
| API (`npm test` in `jek-api`), if touched | |

## Deploy

<!-- Anything the owner must do after merging: an API deploy, a migration, a new secret. "None" if nothing. -->

None.

## Checklist

- [ ] Built pages committed (`node build.mjs` in each app touched)
- [ ] Commits made under my own name and GitHub noreply address
- [ ] No secrets, keys or tokens in the change
