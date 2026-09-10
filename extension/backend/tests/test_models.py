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

from datetime import datetime, timezone

import pytest

from community.notifications.models import Notification, NotificationValidationError


def _payload(**overrides):
    payload = {"name": "Maintenance", "message": "DB maintenance tonight"}
    payload.update(overrides)
    return payload


class TestFromRequestValidation:
    def test_minimal_valid_payload(self):
        notification = Notification.from_request(_payload())
        assert notification.name == "Maintenance"
        assert notification.category == "info"
        assert notification.active is True
        assert notification.target_roles == []
        assert notification.id
        assert notification.created_on == notification.changed_on

    @pytest.mark.parametrize("key", ["name", "message"])
    def test_missing_required_field_raises(self, key):
        payload = _payload()
        del payload[key]
        with pytest.raises(NotificationValidationError):
            Notification.from_request(payload)

    @pytest.mark.parametrize("value", ["", "   ", 123, None])
    def test_blank_or_non_string_name_raises(self, value):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(name=value))

    def test_invalid_category_raises(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(category="urgent"))

    @pytest.mark.parametrize("category", ["info", "warning", "error"])
    def test_valid_categories_accepted(self, category):
        assert Notification.from_request(_payload(category=category)).category == category

    def test_non_list_target_roles_raises(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(target_roles="Admin"))

    def test_non_string_target_roles_entries_raise(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(target_roles=["Admin", 5]))

    def test_invalid_start_time_raises(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(start_time="not-a-date"))

    def test_valid_iso_start_and_end_time_accepted(self):
        notification = Notification.from_request(
            _payload(start_time="2026-01-01T00:00:00Z", end_time="2026-02-01T00:00:00Z")
        )
        assert notification.start_time == "2026-01-01T00:00:00Z"
        assert notification.end_time == "2026-02-01T00:00:00Z"

    def test_daily_timeframe_enabled_without_times_raises(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(daily_timeframe_enabled=True))

    def test_daily_timeframe_enabled_with_invalid_time_format_raises(self):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(
                _payload(
                    daily_timeframe_enabled=True,
                    daily_start_time="9am",
                    daily_end_time="17:00",
                )
            )

    def test_daily_timeframe_enabled_with_valid_times_accepted(self):
        notification = Notification.from_request(
            _payload(
                daily_timeframe_enabled=True,
                daily_start_time="09:00",
                daily_end_time="17:00",
            )
        )
        assert notification.daily_timeframe_enabled is True
        assert notification.daily_start_time == "09:00"
        assert notification.daily_end_time == "17:00"

    @pytest.mark.parametrize("key", ["retrigger_interval_minutes", "duration_seconds"])
    def test_negative_integer_fields_raise(self, key):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(**{key: -1}))

    @pytest.mark.parametrize("key", ["retrigger_interval_minutes", "duration_seconds"])
    def test_non_integer_fields_raise(self, key):
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(**{key: "5"}))

    @pytest.mark.parametrize("key", ["retrigger_interval_minutes", "duration_seconds"])
    def test_bool_rejected_for_integer_fields(self, key):
        # bool is a subclass of int in Python; True/False must not silently
        # pass as 1/0.
        with pytest.raises(NotificationValidationError):
            Notification.from_request(_payload(**{key: True}))

    def test_update_preserves_id_and_created_on(self):
        original = Notification.from_request(_payload())
        updated = Notification.from_request(
            _payload(name="Updated"),
            notification_id=original.id,
            created_on=original.created_on,
        )
        assert updated.id == original.id
        assert updated.created_on == original.created_on
        assert updated.name == "Updated"


class TestSerialization:
    def test_to_dict_from_dict_roundtrip(self):
        original = Notification.from_request(_payload(target_roles=["Admin", "Gamma"]))
        restored = Notification.from_dict(original.to_dict())
        assert restored == original

    def test_from_dict_ignores_unknown_keys(self):
        payload = Notification.from_request(_payload()).to_dict()
        payload["some_future_field"] = "ignored"
        # Should not raise despite the extra key.
        Notification.from_dict(payload)


class TestIsEffective:
    def test_inactive_notification_never_effective(self):
        notification = Notification.from_request(_payload(active=False))
        now = datetime.now(timezone.utc)
        assert notification.is_effective(now, {"Admin"}) is False

    def test_empty_target_roles_matches_everyone(self):
        notification = Notification.from_request(_payload())
        now = datetime.now(timezone.utc)
        assert notification.is_effective(now, {"Gamma"}) is True

    def test_target_roles_requires_intersection(self):
        notification = Notification.from_request(_payload(target_roles=["Admin"]))
        now = datetime.now(timezone.utc)
        assert notification.is_effective(now, {"Admin"}) is True
        assert notification.is_effective(now, {"Gamma"}) is False
        assert notification.is_effective(now, {"Gamma", "Admin"}) is True

    def test_absolute_window_boundaries(self):
        notification = Notification.from_request(
            _payload(
                start_time="2026-06-01T00:00:00Z",
                end_time="2026-06-02T00:00:00Z",
            )
        )
        before = datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc)
        at_start = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        at_end = datetime(2026, 6, 2, 0, 0, 0, tzinfo=timezone.utc)
        after = datetime(2026, 6, 2, 0, 0, 1, tzinfo=timezone.utc)

        assert notification.is_effective(before, set()) is False
        assert notification.is_effective(at_start, set()) is True
        # end_time is exclusive
        assert notification.is_effective(at_end, set()) is False
        assert notification.is_effective(after, set()) is False

    def test_daily_timeframe_non_wrapping_window(self):
        notification = Notification.from_request(
            _payload(
                daily_timeframe_enabled=True,
                daily_start_time="09:00",
                daily_end_time="17:00",
            )
        )
        base = datetime(2026, 6, 15, tzinfo=timezone.utc)
        assert notification.is_effective(base.replace(hour=8), set()) is False
        assert notification.is_effective(base.replace(hour=9), set()) is True
        assert notification.is_effective(base.replace(hour=12), set()) is True
        assert notification.is_effective(base.replace(hour=17), set()) is False

    def test_daily_timeframe_overnight_wraparound(self):
        notification = Notification.from_request(
            _payload(
                daily_timeframe_enabled=True,
                daily_start_time="22:00",
                daily_end_time="02:00",
            )
        )
        base = datetime(2026, 6, 15, tzinfo=timezone.utc)
        assert notification.is_effective(base.replace(hour=23), set()) is True
        assert notification.is_effective(base.replace(hour=1), set()) is True
        assert notification.is_effective(base.replace(hour=12), set()) is False

    def test_absolute_and_daily_windows_both_must_pass(self):
        notification = Notification.from_request(
            _payload(
                start_time="2026-06-01T00:00:00Z",
                end_time="2026-06-30T00:00:00Z",
                daily_timeframe_enabled=True,
                daily_start_time="09:00",
                daily_end_time="17:00",
            )
        )
        # Inside the absolute window but outside the daily timeframe.
        outside_daily = datetime(2026, 6, 15, 20, 0, tzinfo=timezone.utc)
        # Inside the daily timeframe but outside the absolute window.
        outside_absolute = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
        # Inside both.
        inside_both = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)

        assert notification.is_effective(outside_daily, set()) is False
        assert notification.is_effective(outside_absolute, set()) is False
        assert notification.is_effective(inside_both, set()) is True
