# Superset Patches

Core Superset changes this extension depends on that aren't upstream yet.
Unlike `superset-extension-notebooks`'s equivalent directory, there's no
frozen `.patch` file here: the dependency is the whole
`feat/extensions-notifications-poc` branch on `apache/superset`, tracked as
draft PR [#44101](https://github.com/apache/superset/pull/44101). It's a
small, self-contained diff (7 files) that's still evolving in review, so
pointing at the branch/PR is more useful than a snapshot that would drift
out of sync with it.

Until #44101 merges, run this extension against a `superset-testbed3`
checkout of `feat/extensions-notifications-poc`, not `master`.

## What it adds

- `ExtensionContext.window` (`showInformationMessage` / `showWarningMessage`
  / `showErrorMessage`) — the toast surface `useNotificationPolling.ts`
  fires through.
- `GlobalLocations.settings.{menu,panel}` (`src/core/contributions.ts`) — a
  Settings-menu location and a matching full-page view location, outside
  SQL Lab, that `index.tsx` registers the admin screen into.
- The `/extensions/view/:viewId` route (`src/pages/ExtensionView`) that
  hosts a single extension-registered view, since `resolveView` isn't part
  of the public `@apache-superset/core` SDK.

Once #44101 merges, this directory (and the `file:` dependency on a local
`superset-testbed3` checkout noted in the top-level README) both go away.
