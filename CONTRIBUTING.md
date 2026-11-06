# Contributing to Wanju

This is an independent adaptation of OpenFilm. Keep its MIT notices, file format and native editor structure.
Report Wanju issues in this repository. Keep credentials, account databases, operator logs and personal projects
outside commits. Preserve each third-party component's own license.

Use Node.js 24 and pnpm 9.15.9. Run `pnpm install --frozen-lockfile`, then `pnpm typecheck`.
For release tooling changes, run:

```sh
node --test apps/desktop/scripts/wanju-release-options.test.mjs apps/desktop/scripts/wanju-signing.test.mjs scripts/wanju-public-source.test.mjs
```

Document functional changes and add focused regression coverage. Signing and publishing run only from the reviewed
default branch on GitHub-hosted runners. Pull requests do not receive signing credentials.
Maintainers must enable multi-factor authentication and review changes to workflows, build inputs and dependencies.

The mixed-source animation catalog has separate free-sharing restrictions. Do not change its notices or claim
that all assets are MIT. A future signing application must disclose these restrictions and the upstream adaptation.
