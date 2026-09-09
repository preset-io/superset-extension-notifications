# superset-extension-notifications

A Superset Extension implementing [SIP-96 / apache/superset#24271](https://github.com/apache/superset/issues/24271):
admin-configurable in-app notifications (toasts) targeted by role, with
scheduling (time range, optional daily recurrence window), retrigger
interval, and display duration.

Status: planning. Layout and scaffolding are being worked out against the
current Superset Extensions system (see `superset-testbed3`'s
`docs/developer_docs/extensions/`).

## Layout (expected, pending confirmation)

- `extension/` — the extension package itself (manifest + frontend + backend).
- `superset-patches/` — any core Superset changes needed because an
  extension point this feature needs doesn't exist yet upstream. Tracked
  here until they land on a real `apache/superset` branch/PR.

See the planning thread for the current state of the plan and open
questions.
