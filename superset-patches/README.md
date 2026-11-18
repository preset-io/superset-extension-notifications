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

The PR now follows [SIP-235](https://github.com/apache/superset/issues/45248)
(navbar extension points and extension-owned pages). What this extension
uses from it:

- The SDK's `window` namespace (`showInformationMessage` /
  `showWarningMessage` / `showErrorMessage`), the toast surface
  `useNotificationPolling.ts` and `AdminPanel.tsx` fire through.
- Extension pages: a view registered at `views.Locations.page`
  (`global.page`) is served at `/extensions/pages/<id>`, optionally gated on
  a permission. The admin screen is `community.notifications.admin`, gated
  on `can_list_notifications` from this extension's own API.
- `page` menu items at `menus.Locations.settingsMenu`, which the host
  renders as a link in the Settings dropdown (and hides from users without
  the page's permission).

Once #44101 merges, this directory (and the `file:` dependency on a local
`superset-testbed3` checkout noted in the top-level README) both go away.
