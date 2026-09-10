# superset-extension-notifications

A Superset Extension implementing [SIP-96 / apache/superset#24271](https://github.com/apache/superset/issues/24271):
admin-configurable in-app notifications (toasts) targeted by role, with
scheduling (time range, optional daily recurrence window), retrigger
interval, and display duration.

Status: Phase 1 scaffolding in progress. Backend CRUD + active-notification
lookup, an admin management screen, and a polling/toast hook are all wired
and building. See `PLAN.md` for the full status and design notes.

Requires the `feat/extensions-notifications-poc` branch on `apache/superset`
(draft PR [#44101](https://github.com/apache/superset/pull/44101)) — see
`superset-patches/README.md`.

## Layout

- `extension/` — the extension package (manifest + frontend + backend),
  scaffolded via `superset-extensions-cli` and built with
  `superset-extensions build`.
- `superset-patches/` — the core Superset changes this extension depends on
  that aren't upstream yet. See its README for current status.

## Local development

`extension/frontend`'s `@apache-superset/core` devDependency is a `file:`
reference into a sibling `superset-testbed3` checkout (matching the pattern
in `superset-extension-notebooks`), not the published npm package — the
published `0.1.0` package predates both the Phase-0 `.window`/
`GlobalLocations` additions this extension needs and, independently, has
peer dependencies (`react@^17`, `antd@^5.26`) that no longer match the
actual host (`react@^18.3`, `antd@^6`). `npm install` in `extension/frontend`
needs `--legacy-peer-deps` until that's resolved upstream.

See `PLAN.md` for the full status and design notes.
