# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""
Notification persistence over the extension's own Tier-3 shared storage.

Each notification is one entry, keyed by its own uuid, under
`ctx.storage.persistent.shared` -- `.shared`, not the default user-scoped
accessor, since notifications are admin-authored and instance-wide, not
private per-user data. The ambient `PersistentStateAccessor` (unlike the
lower-level `ExtensionStorageDAO`) has no `resource_type`/`resource_uuid`
tagging on `set()`, so there's nothing to filter listing by beyond the
extension's own storage scope -- this extension is the sole owner of that
scope, so a plain full list is both correct and sufficient.
"""

from __future__ import annotations

from superset_core.extensions.context import get_context
from superset_core.extensions.storage.persistent import (
    PersistentListOptions,
    PersistentStateAccessor,
)

from .models import Notification

#: Entries per `list()` page. Admin-authored notification counts are small
#: (tens, not thousands); this comfortably covers a single page for any
#: realistic deployment while `list_all` still pages correctly if it doesn't.
PAGE_SIZE = 100


def _shared() -> PersistentStateAccessor:
    return get_context().storage.persistent.shared


def list_all() -> list[Notification]:
    """Every configured notification, active or not."""
    notifications: list[Notification] = []
    page = 0
    while True:
        result = _shared().list(PersistentListOptions(page=page, page_size=PAGE_SIZE))
        notifications.extend(Notification.from_dict(entry.value) for entry in result.entries)
        if not result.entries or len(notifications) >= result.count:
            break
        page += 1
    return notifications


def get(notification_id: str) -> Notification | None:
    value = _shared().get(notification_id)
    return Notification.from_dict(value) if value is not None else None


def save(notification: Notification) -> None:
    _shared().set(notification.id, notification.to_dict())


def delete(notification_id: str) -> None:
    _shared().remove(notification_id)
