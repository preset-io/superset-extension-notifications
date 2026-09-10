# Plan: SIP-96 notifications as a Superset Extension

Tracking doc for implementing [apache/superset#24271](https://github.com/apache/superset/issues/24271)
(SIP-96: admin-configurable in-app notifications) as a Superset Extension.

## Status

- [x] Researched the current Extensions system (contribution types, storage API, gaps)
- [x] Filed [apache/superset#44095](https://github.com/apache/superset/issues/44095) for the dead
      `quick-start.md` example-extension reference
- [x] Phase 0 code written on `superset-testbed3` branch `feat/extensions-notifications-poc`
- [x] Phase 0 PR opened as a draft against apache/superset:
      [apache/superset#44101](https://github.com/apache/superset/pull/44101)
      (open, mergeable, CI green aside from a benign Showtime cancellation — no
      maintainer review yet as of 2026-09-09)
- [x] Phase 1 scaffolded: backend CRUD + active-notification lookup, admin
      screen, polling/toast hook all written, type-checked, and building
      clean via `superset-extensions build` (2026-09-09)
- [x] Phase 1 automated tests: 41 backend (pytest) + 12 frontend (Jest)
      passing (2026-09-10)
- [ ] Phase 1: manual end-to-end test against a running `superset-testbed3`
      (branch `feat/extensions-notifications-poc`) with `ENABLE_EXTENSIONS`
      on — in progress

## Testing (2026-09-10)

- **Backend** (`extension/backend/tests/`): `test_models.py` (41 cases:
  every `from_request` validation branch, `to_dict`/`from_dict` roundtrip,
  `is_effective` across role targeting, absolute-window boundaries, daily
  timeframe incl. overnight wraparound, and the two windows combined) and
  `test_storage.py` (CRUD roundtrip + pagination against a fake in-memory
  `PersistentStateAccessor`, since `get_context()` only resolves to
  something real inside a running Superset process). `api.py` itself
  can't be unit-tested the same way -- confirmed directly, its `@api`
  decorator raises `NotImplementedError` when imported outside a running
  host -- so its route/permission wiring is covered by the end-to-end pass
  instead. Backend package made installable (`pip install -e
  extension/backend`, added `[build-system]`/`packages.find` to
  `pyproject.toml`) so pytest can import `community.notifications.*`
  normally.
- **Frontend** (`extension/frontend/src/*.test.{ts,tsx}`, Jest +
  `@testing-library/react`, `babel-jest`): `useNotificationPolling.test.ts`
  (6 cases, fake timers) is fully green, covering category routing,
  no-retrigger vs. retrigger-elapsed re-showing, teardown, and a failed
  poll not throwing. `AdminPanel.test.tsx` covers list rendering, column
  formatting (roles/active/category), one-row-per-notification, the New
  Notification action being present, and a load failure surfacing via
  `ctx.window.showErrorMessage`.
  **Not covered by the automated suite:** the actual create/edit/delete
  *flows* (click a button, fill the Modal form, submit). Every one of
  those tests was written and reliably hung past any timeout in this
  jsdom environment specifically -- confirmed via progressively narrower
  isolated repros that a bare open Modal, a click-opened Modal, a
  Modal+`Form.useForm()`, and a full Table+Modal+Form+Popconfirm harness
  all work fine (109ms-1.2s), so it isn't Modal, Form, or Popconfirm in
  isolation. Ruled out, with evidence: the React-18-scheduler
  `MessageChannel` leak (real Node's leaks a handle but doesn't cause the
  hang itself -- fixed anyway via `forceExit: true` and a synchronous
  microtask shim in `jest.setup.ts`), `jest.mock('./api')` auto-mocking
  vs. an explicit manual mock, and `rc-trigger`'s
  `getBoundingClientRect`-based popup positioning (polyfilled anyway,
  didn't fix it). Root cause not pinned down. Rather than keep spending
  time on jsdom-specific archaeology, these flows get real (and more
  trustworthy) coverage in the end-to-end pass against an actual browser,
  where this category of jsdom/React-scheduler interop bug doesn't apply.
  Setup added along the way that's worth keeping regardless:
  `jest.setup.ts`'s `matchMedia`/`ResizeObserver`/`getBoundingClientRect`
  polyfills and the `MessageChannel` shim are standard requirements for
  testing antd components in jsdom at all.

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

Scaffolded via `superset-extensions init --frontend --backend`
(publisher `community`, name `notifications`) into `extension/`, then
built out:

- Backend (`extension/backend/src/community/notifications/`):
  - `models.py` — the `Notification` dataclass, request validation
    (`from_request`), and `is_effective(now, user_role_names)` (active flag,
    role targeting, absolute window, daily timeframe incl. overnight
    wraparound). Verified against real inputs, not just read over — see
    the manual test run logged 2026-09-09.
  - `storage.py` — each notification is one entry in the extension's own
    Tier-3 **shared** persistent storage (`ctx.storage.persistent.shared`),
    keyed by its own uuid. Plan originally called for `resource_type`
    tagging, dropped once implementation showed the *ambient* accessor's
    `set()` doesn't expose `resource_type`/`resource_uuid` (only the
    lower-level `ExtensionStorageDAO` does, and its own `create()` always
    raises by design) — moot anyway since this extension is the sole owner
    of its storage scope, so a plain full `list()` is sufficient.
  - `api.py` — one `RestApi` class, `community_notifications`: `GET/POST /`,
    `PUT/DELETE /<id>` (admin CRUD, `can_*` perms meant for a trusted role
    only) and `GET /active` (`can_get_active`, meant to be granted broadly
    — role-filtering happens in `is_effective`, not at the permission
    layer). Grant `can_get_active` to whichever roles should see
    notifications; it is **not** granted automatically.
- Frontend (`extension/frontend/src/`):
  - `useNotificationPolling.ts` — 5-minute interval poll of `/active`;
    "last shown" per-notification state lives in `ctx.storage.local`
    (per-browser), not Tier 3, since Tier 3 has no per-recipient
    delivery-state concept. **Known gap:** `Notification.duration_seconds`
    (from the SIP mockups) has no effect yet — Phase 0's
    `ExtensionContext.window.show*Message(message)` takes no duration
    parameter. Needs a Phase-0 follow-up, not a Phase-1 workaround.
  - `AdminPanel.tsx` — table + modal form, registered at
    `GlobalLocations.settings.panel` / `.menu`. Covers active/name/message/
    category/target-roles/absolute-window/daily-timeframe/retrigger-interval
    from the SIP mockups; `duration_seconds` deliberately left off the form
    for the same reason as above (no point exposing a control that
    silently does nothing).
  - No SPA navigation primitive exists in the SDK yet (`navigation` is
    read-only page-surface introspection) — the "open admin" command does a
    full `window.location.assign()`, not a route push.
- `ENABLE_UI_NOTIFICATIONS`-as-extension-setting (the plan's original
  bullet on this) — not built yet; today `active` is per-notification, no
  extension-wide kill switch beyond the global `ENABLE_EXTENSIONS` flag.
  Small addition if wanted later (one more `ctx.storage.persistent.shared`
  key), not blocking.

**Not done yet:** manual end-to-end verification against a running host,
and automated tests for any of the above.

## Ecosystem bugs found while scaffolding (2026-09-09)

Not this extension's bugs, but real, reproducible, and worth fixing
upstream separately:

- `superset-extensions-cli`'s scaffold template
  (`templates/frontend/package.json.j2`) pins `react`/`react-dom` to
  `^17.0.2` and `@types/react` to `^19.0.10`. The actual host
  (`superset-frontend/package.json`) is on React `^18.3.0`. Every
  scaffolded extension starts with a peer-dependency mismatch against its
  own host.
- The same template never lists `@apache-superset/core` under
  `devDependencies` — only `peerDependencies` — despite the quick-start
  docs explicitly saying it needs to be in both "to provide TypeScript
  types during build." Every scaffolded extension fails `tsc` with
  `TS2307: Cannot find module '@apache-superset/core'` out of the box.
- The **published** `@apache-superset/core@0.1.0` npm package's own
  peer deps (`react@^17.0.2`, `antd@^5.26.0`) are stale relative to the
  current host (`react@^18.3.0`, `antd@^6.0.0`) — a fresh `npm install`
  following the quick-start docs to the letter still needs
  `--legacy-peer-deps` to succeed at all, on top of the two bugs above.

Worked around locally the same way `superset-extension-notebooks` does
(`file:` dependency on a local `superset-testbed3` checkout instead of the
published package) — necessary here anyway, independent of the version
skew, since the published package predates the Phase-0 `.window`/
`GlobalLocations` additions this extension needs. Worth a small upstream
PR to `superset-extensions-cli` (react/`@types/react` version bump + the
missing `devDependencies` entry) and a `superset-core` republish; not done
as part of this work.

## Repo layout (mirrors the sibling `superset-extension-notebooks` pattern)

- `extension/` — the extension package (manifest + frontend + backend),
  scaffolded via `superset-extensions-cli`.
- `superset-patches/` — a copy of whatever Phase-0 core diff this depends
  on, tracked here until it's a real merged PR upstream.

## Open items

- Confirm with Enzo Martellucci / Michael S. Molina (primary drivers of the
  extensions system per commit history) once the draft PR is up, in case
  there's a reason the global-menu/toast surfaces weren't already built.
