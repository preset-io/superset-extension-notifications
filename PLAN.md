# Plan: SIP-96 notifications as a Superset Extension

Tracking doc for implementing [apache/superset#24271](https://github.com/apache/superset/issues/24271)
(SIP-96: admin-configurable in-app notifications) as a Superset Extension.

## Status

- [x] Researched the current Extensions system (contribution types, storage API, gaps)
- [x] Filed [apache/superset#44095](https://github.com/apache/superset/issues/44095) for the dead
      `quick-start.md` example-extension reference
- [x] Phase 0 code written on `superset-testbed3` branch `feat/extensions-notifications-poc`
      (staged, not yet committed — blocked on an unrelated pre-existing `react-window`
      version mismatch breaking the local Type-Checking pre-commit hook; fixing via `npm ci`
      before committing, per Evan's call)
- [ ] Phase 0 PR opened as a draft against apache/superset
- [ ] Phase 1: the extension itself (this repo)

## Phase 0 findings (implementation, not just research)

Turned out smaller than the research pass feared, because the `views`/`menus` registries in
`superset-frontend/src/core/{views,menus}/index.ts` were already fully generic
(`registerView(view, location, component)` / `registerMenuItem(item, location, group)` take an
arbitrary `location` string) — SQL Lab was just the only *consumer* so far, via
`src/SqlLab/contributions.ts`'s `ViewLocations` constants and the reusable
`<ViewListExtension viewId={location} />` renderer. Nothing SQL-Lab-specific in the registries
themselves.

What actually got built:
- `ExtensionContext.window` (`showInformationMessage`/`showWarningMessage`/`showErrorMessage`) —
  thin wrapper over the existing toast action creators, dispatched directly against the
  `store` singleton (`src/views/store.ts`) rather than via a hook, since it must also work from
  non-component extension code like a command callback.
- `GlobalLocations.settings.{menu,panel}` (new `src/core/contributions.ts`, mirroring
  `SqlLab/contributions.ts`) — a menus location consumed by `RightMenu.tsx`'s Settings dropdown
  (new "Extensions" group, exactly mirroring `PanelToolbar`'s existing
  `commands.getCommand`/`executeCommand` pattern) and a views location for whatever an
  extension registers to host at the new route below.
- A new generic route, `/extensions/view/:viewId` (`src/pages/ExtensionView`), hosting a single
  extension-registered view. Needed because `resolveView` is host-internal
  (`src/core/views/index.ts`), not exported through the public `@apache-superset/core` SDK —
  extensions can't render their own registered views directly, the host has to.
- **Permission registration turned out to already work, no new code needed.**
  `superset/core/api/core_api_injection.py`'s `add_api()` calls
  `appbuilder.add_api(api_class)` + `appbuilder._add_permission(view, True)` — the real FAB
  registration path core APIs use. A `@permission_name(...)` on an extension's own `@api`
  endpoint already produces a genuine, distinct permission visible in the role editor.

Tests: `ExtensionContext.test.ts` (4 new cases for `.window`, mocking `src/views/store` since
it transitively pulls in the full dashboard/explore/chart reducer tree and assumes bootstrap
data is already hydrated — true in a real browser by the time extension code runs, not true in
the unit test environment) and `RightMenu.test.tsx` (1 new case registering a real command +
menu item and asserting it renders in the opened Settings dropdown). All green;
`npx tsc --noEmit -p tsconfig.json` clean; oxlint/oxfmt clean.

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
