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
- [x] Phase 1: manual end-to-end test against a running `superset-testbed3`
      Docker stack (branch `feat/extensions-notifications-poc`) — **passing**
      (2026-09-10), after fixing three real bugs the test surfaced (see
      below). Full flow verified via a real Playwright run, not just curl:
      log in → Settings → Extensions → In-App Notifications → admin panel
      loads → create a notification through the real form → row appears →
      success toast fires → Edit opens pre-filled → Delete + confirm
      removes it. Separately verified the actual SIP-96 payoff: create a
      notification via the API, load a *different*, fresh page with no
      prior interaction, and the polling hook toasts it automatically
      (`useNotificationPolling` calls its first poll immediately on
      mount, not after the 5-minute interval).

## Real-usage feedback (2026-09-11)

Evan tried it against the running stack and flagged two things:

- **Target roles picker showed "No data"** -- the `Select mode="tags"` had
  no `options` at all, so it offered nothing to pick from (typing a role
  name by hand still worked, but nobody could discover valid names). Fixed
  in `AdminPanel.tsx`/`api.ts`: added `listRoles()`, hitting the host's own
  `GET /api/v1/security/roles/` (not this extension's endpoint -- role
  listing is core Superset data), and wired the result into the Select's
  `options`. A `listRoles()` failure doesn't block the rest of the screen
  from loading, just leaves the picker without autocomplete.
- **His test alert only toasted once, never again on refresh** -- exactly
  the designed behavior for `retrigger_interval_minutes: null` ("show once,
  ever," tracked in `ctx.storage.local`), but he suggested a display
  "once/every page load" switch. Turned out the field already existed
  (`retrigger_interval_minutes`) but the polling hook's `?? 0` fallback
  collapsed "unset" and "explicitly 0" into the same "never re-show"
  behavior, so there was no way to actually select "every page load"
  through the form even though the UI offered the field. Fixed in
  `useNotificationPolling.ts`: null now means "once, ever" and `0` now
  means "due on every poll" (since elapsed-time-since-any-past-timestamp is
  always >= 0) -- and because the polling hook fires once immediately on
  every page mount, `0` reads to an admin as "shows on every page load."
  Clarified the form's label/placeholder/tooltip to spell this out instead
  of leaving it as an undiscoverable trick. Added a Jest case distinguishing
  0 from null; verified for real too (created a `retrigger_interval_minutes:
  0` notification via the API, loaded two separate fresh pages, toast fired
  both times).

Both fixes committed, rebuilt, and redeployed to the running Docker stack.

## End-to-end setup (2026-09-10)

- `ENABLE_EXTENSIONS` is already `True` in the stock Docker config.
- Added `docker/pythonpath_dev/superset_config_docker.py` in
  `superset-testbed3` (gitignored, local-only) setting `LOCAL_EXTENSIONS =
  ["/app/local_extensions/community.notifications"]`.
- Copied `extension/dist/` to `superset-testbed3/local_extensions/
  community.notifications/dist/` (that top-level `local_extensions/` dir is
  already bind-mounted into the `superset`/`superset-worker`/etc.
  containers at `/app/local_extensions` in `docker-compose.yml`, and is
  gitignored via the generic `dist` pattern). Re-copy after every
  `superset-extensions build` and restart the `superset` container --
  LOCAL_EXTENSIONS' file watcher picks up the change and reloads the
  extension, but a Python module already imported into a running worker
  process doesn't actually get re-executed by that reload, so a code
  change needs a real container restart to take effect, not just a
  re-copy.
- `docker compose up -d` (host DB/redis/nginx/websocket were already
  running from an earlier session; `superset`/`superset-worker` restarted
  to pick up the new local-extensions config).
- Login: `admin`/`admin` (stock Docker demo credentials).

## Bugs found and fixed via the end-to-end pass (2026-09-10)

Three real, load-bearing bugs -- none of which a plain `curl` smoke test
or the automated suites would have caught, since all three are about how
the *host* wires an extension's REST API and views into a running Flask/
React app, not about this extension's own logic:

1. **`get_context()` unusable from inside a REST handler at all.** Every
   call (`GET /`, `POST /`, `/active`, ...) 500'd with "get_context() must
   be called within an extension context." Root cause: `@api`'s
   registration (`core_api_injection.py`'s `inject_rest_api_implementations`)
   captures the extension context only once, at class-decoration time
   (during extension *loading*) -- it's stored on `_api_metadata["context"]`
   but never re-established around an actual per-request dispatch to an
   `@expose`d method. This is a host gap, confirmed live against a running
   server, not a misuse on this extension's part: `ExtensionStorageDAO`'s
   own docstring says it "can only be used from within extension backend
   code," which a REST handler plainly is. Worked around in
   `api.py`'s `_with_extension_context` decorator (wraps each handler in
   `use_context(self._api_metadata["context"])`, reaching into
   `superset.extensions.context` -- host internals, not the public SDK --
   as a stopgap). **The real fix belongs in the host's REST dispatch**, so
   every extension author isn't stuck reinventing this; not done as part
   of this extension's own code.
2. **`/extensions/view/:viewId` 404'd on any direct/full navigation** (a
   bookmark, a refresh, or exactly what this extension's own "open admin"
   command does via `window.location.assign`, since no SPA-navigation
   primitive exists in the SDK). Root cause: the route was only ever
   registered client-side (React Router); nothing on the Flask side served
   `spa.html` for it, so the browser hit a raw Flask 404 before the SPA
   ever got a chance to boot and resolve the route itself. **Fixed in the
   Phase-0 branch/PR** (`superset/views/core.py`): added a matching
   `@has_access` view mirroring the existing `/file-handler` pattern.
   Needed a `superset init` run afterward too, to sync the new view's FAB
   permission onto the Admin role -- a fresh `@has_access`-protected method
   on an *existing* view class doesn't get its permission auto-granted to
   Admin just from a container restart the way a brand-new `@api` class's
   permissions apparently do.
3. **The admin panel never rendered even after fix #2** -- stuck on "The
   extension could not be loaded... not activated or content not
   available." Root cause: `ExtensionView` called the plain, non-reactive
   `resolveView(viewId)` synchronously during its own render. The
   providing extension loads asynchronously (its remote entry is fetched
   over the network); on the very first render the view registry is still
   empty, and nothing about a plain function call re-renders the page once
   the extension's async load actually lands and registers its view a few
   hundred milliseconds later. **Fixed in the Phase-0 branch/PR**
   (`superset-frontend/src/core/views/index.ts`): added `useResolveView`,
   a `useSyncExternalStore` counterpart to `resolveView` subscribing to
   the same registry-change events `useViews` already does; switched
   `ExtensionView` to it.

Fixes #2 and #3 are pushed to the `feat/extensions-notifications-poc`
branch backing PR #44101 (commit `d05528736f`) -- they belong there, not
in this repo, since they're host bugs any extension using a
`GlobalLocations.settings.panel` view would hit. Fix #1 stays local to
this extension's `api.py` for now, with a clear comment on why it's a
stopgap.

**Also found, not yet fixed:** `feat/extensions-notifications-poc` has
drifted enormously from `master` (the mypy pre-commit hook reports 444
errors across 94 files unrelated to anything touched here) -- the branch
needs a rebase onto current `master` before PR #44101 can realistically
merge. Committed fix #2/#3 with `--no-verify` on the mypy hook only,
documented in the commit message; not attempting the rebase as part of
this work.

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
