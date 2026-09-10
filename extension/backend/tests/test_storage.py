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
Tests for `storage.py` against a fake in-memory `PersistentStateAccessor`,
standing in for the host's real Tier-3 implementation -- `get_context()`
only resolves to something real inside a running Superset process (see
`api.py`'s `NotImplementedError` when imported standalone), so this is the
level storage.py can actually be unit-tested at.
"""

from __future__ import annotations

from superset_core.extensions.storage.persistent import (
    PersistentListEntry,
    PersistentListOptions,
    PersistentListResult,
)

from community.notifications import storage
from community.notifications.models import Notification


class FakeSharedAccessor:
    """Minimal in-memory stand-in for `PersistentStateAccessor`."""

    def __init__(self) -> None:
        self._entries: dict[str, object] = {}

    def get(self, key):
        return self._entries.get(key)

    def set(self, key, value, options=None):
        self._entries[key] = value

    def remove(self, key):
        self._entries.pop(key, None)

    def list(self, options: PersistentListOptions) -> PersistentListResult:
        keys = list(self._entries.keys())
        start = options.page * options.page_size
        page_keys = keys[start : start + options.page_size]
        return PersistentListResult(
            entries=[
                PersistentListEntry(key=k, value=self._entries[k], codec="json")
                for k in page_keys
            ],
            count=len(keys),
        )


class FakeExtensionContext:
    def __init__(self, shared: FakeSharedAccessor) -> None:
        self.storage = type(
            "Storage",
            (),
            {"persistent": type("Persistent", (), {"shared": shared})()},
        )()


def _patch_context(monkeypatch, shared: FakeSharedAccessor) -> None:
    monkeypatch.setattr(
        storage, "get_context", lambda: FakeExtensionContext(shared)
    )


def _notification(**overrides) -> Notification:
    payload = {"name": "Maintenance", "message": "DB maintenance tonight"}
    payload.update(overrides)
    return Notification.from_request(payload)


def test_save_and_get_roundtrip(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    notification = _notification()

    storage.save(notification)

    assert storage.get(notification.id) == notification


def test_get_missing_returns_none(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    assert storage.get("does-not-exist") is None


def test_delete_removes_entry(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    notification = _notification()
    storage.save(notification)

    storage.delete(notification.id)

    assert storage.get(notification.id) is None


def test_delete_missing_is_a_no_op(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    # Should not raise even though nothing was ever stored.
    storage.delete("does-not-exist")


def test_list_all_returns_every_saved_notification(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    first = _notification(name="First")
    second = _notification(name="Second")
    storage.save(first)
    storage.save(second)

    result = {n.id: n for n in storage.list_all()}

    assert result == {first.id: first, second.id: second}


def test_list_all_empty_when_nothing_saved(monkeypatch):
    _patch_context(monkeypatch, FakeSharedAccessor())
    assert storage.list_all() == []


def test_list_all_pages_past_a_single_page(monkeypatch):
    """`list_all` must keep paging until every entry is fetched, not just
    return the first page -- exercised here with a page size far smaller
    than the number of saved notifications."""
    _patch_context(monkeypatch, FakeSharedAccessor())
    monkeypatch.setattr(storage, "PAGE_SIZE", 2)

    saved = [_notification(name=f"Notice {i}") for i in range(5)]
    for notification in saved:
        storage.save(notification)

    result = {n.id: n for n in storage.list_all()}

    assert result == {n.id: n for n in saved}
