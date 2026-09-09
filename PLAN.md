# Plan: SIP-96 notifications as a Superset Extension

Tracking doc for implementing [apache/superset#24271](https://github.com/apache/superset/issues/24271)
(SIP-96: admin-configurable in-app notifications) as a Superset Extension.

## Status

- [x] Researched the current Extensions system (contribution types, storage API, gaps)
- [x] Filed [apache/superset#44095](https://github.com/apache/superset/issues/44095) for the dead
      `quick-start.md` example-extension reference
- [ ] Phase 0: core extension points (toast trigger + global menu/view area) — in progress on
      `superset-testbed3` branch `feat/extensions-notifications-poc`
- [ ] Phase 1: the extension itself (this repo)

## Why this needs Phase 0 first

The Extensions system today only exposes SQL-Lab-scoped contribution areas
(`sqllab.panels`, `sqllab.statusBar`, `sqllab.editor`) and `ExtensionContext`
only exposes `.extension` / `.storage` — no toast trigger, no global
menu/page area, no way for an extension to register a new RBAC permission.
SIP-96 needs a global toast and an admin screen reachable outside SQL Lab,
neither of which has an injection point yet. Evan's call: build both
directly as a POC, no SIP/issue needed first — open a draft PR, and only
escalate to a real SIP if there's contention on review.

## Phase 0 — core extension points (superset-testbed3, branch `feat/extensions-notifications-poc`)

1. **Toast trigger on `ExtensionContext`** — thin wrapper over the existing
   `addDangerToast`/`addSuccessToast`/`addWarningToast`/`addInfoToast`
   (`superset-frontend/src/components/MessageToasts/actions`). Generically
   useful beyond this feature.
2. **A global menu/view contribution area** alongside the existing
   `sqllab.*` ones — scoped narrowly (e.g. `settings.menu` + one generic
   global view registration), not a full generic-everywhere system.
3. **Permission registration, best-effort.** Evan's call: Admin-only gating
   is fine for v1 either way. If it's easy for an extension to register a
   new RBAC permission, do it as a bonus; if not, state it as documented
   follow-up work in the PR rather than building new RBAC machinery now.

## Phase 1 — the extension (this repo)

- Backend: extension-owned REST API for notification CRUD (this
  contribution type already works today), each notification stored as one
  Tier-3 storage record (`resource_type="notification"`), target roles
  stored inline in the record (no second relational table needed — Tier 3
  storage is a namespaced KV store, not arbitrary-relational).
- Backend: an "active notifications for current user" endpoint doing
  role/time-window filtering in Python over `list()` results (Tier 3 has no
  arbitrary-WHERE query support).
- Frontend: interval-polling hook (matches the original SIP design) firing
  toasts via the new Phase-0 toast surface.
- Frontend: admin management screen via the new Phase-0 menu/view area,
  replicating the SIP's mockups (active toggle, name, category, message,
  time range, daily-timeframe toggle, retrigger interval, duration, roles).
- `ENABLE_UI_NOTIFICATIONS` becomes an extension-level admin setting
  (Tier-3-stored toggle), not a real Superset `FeatureFlag` — no
  extension-specific feature-flag mechanism exists beyond the global
  `ENABLE_EXTENSIONS` switch.

## Repo layout (mirrors the sibling `superset-extension-notebooks` pattern)

- `extension/` — the extension package (manifest + frontend + backend),
  scaffolded via `superset-extensions-cli`.
- `superset-patches/` — a copy of whatever Phase-0 core diff this depends
  on, tracked here until it's a real merged PR upstream.

## Open items

- Confirm with Enzo Martellucci / Michael S. Molina (primary drivers of the
  extensions system per commit history) once the draft PR is up, in case
  there's a reason the global-menu/toast surfaces weren't already built.
