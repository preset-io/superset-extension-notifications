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
The `Notification` record and its request-payload validation.

A notification is stored as a single Tier-3 shared storage entry (see
`storage.py`) -- there's no relational schema, so this dataclass is the only
place the shape is defined. `from_request`/`to_dict` are the (de)serialization
boundary for both the REST API and storage.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, time, timezone
from typing import Any
from uuid import uuid4

CATEGORIES = ("info", "warning", "error")


class NotificationValidationError(Exception):
    """Raised when a notification request payload fails validation."""


def _require_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise NotificationValidationError(f"'{key}' is required and must be a string")
    return value


def _parse_iso(value: Any, key: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise NotificationValidationError(f"'{key}' must be an ISO-8601 string")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as ex:
        raise NotificationValidationError(f"'{key}' is not a valid ISO-8601 value") from ex
    return value


def _parse_daily_time(value: Any, key: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise NotificationValidationError(f"'{key}' must be an 'HH:MM' string")
    try:
        time.fromisoformat(value)
    except ValueError as ex:
        raise NotificationValidationError(f"'{key}' must be an 'HH:MM' string") from ex
    return value


def _parse_positive_int(value: Any, key: str) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise NotificationValidationError(f"'{key}' must be a non-negative integer")
    return value


@dataclass
class Notification:
    id: str
    name: str
    message: str
    category: str = "info"
    active: bool = True
    #: Role names this notification is shown to. Empty means "every role",
    #: not "no role" -- a notification with no targeting configured yet
    #: would otherwise silently reach nobody.
    target_roles: list[str] = field(default_factory=list)
    #: Absolute window the notification is eligible in, ISO-8601. Either or
    #: both may be None (open-ended).
    start_time: str | None = None
    end_time: str | None = None
    #: Time-of-day window (e.g. "09:00"-"17:00", business-hours-only
    #: notices). Independent of the absolute window above; both must pass.
    daily_timeframe_enabled: bool = False
    daily_start_time: str | None = None
    daily_end_time: str | None = None
    #: Minutes before a still-active notification is shown again to a user
    #: who already saw it. None means "show once, ever" -- the frontend
    #: hook, not this record, tracks per-user "last shown" state (Tier 3
    #: has no per-recipient delivery-state concept).
    retrigger_interval_minutes: int | None = None
    #: Toast display duration in seconds. None defers to the host's default
    #: toast duration.
    duration_seconds: int | None = None
    created_on: str | None = None
    changed_on: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Notification":
        known = {f.name for f in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in value.items() if k in known})

    @classmethod
    def from_request(
        cls,
        payload: dict[str, Any],
        *,
        notification_id: str | None = None,
        created_on: str | None = None,
    ) -> "Notification":
        """
        Build (and validate) a `Notification` from a REST request body.

        `notification_id`/`created_on` are supplied on update (carried over
        from the existing record) and omitted on create (freshly generated).
        """
        name = _require_str(payload, "name")
        message = _require_str(payload, "message")

        category = payload.get("category", "info")
        if category not in CATEGORIES:
            raise NotificationValidationError(
                f"'category' must be one of {CATEGORIES}"
            )

        target_roles = payload.get("target_roles", [])
        if not isinstance(target_roles, list) or not all(
            isinstance(r, str) for r in target_roles
        ):
            raise NotificationValidationError("'target_roles' must be a list of strings")

        daily_timeframe_enabled = bool(payload.get("daily_timeframe_enabled", False))
        daily_start_time = _parse_daily_time(
            payload.get("daily_start_time"), "daily_start_time"
        )
        daily_end_time = _parse_daily_time(
            payload.get("daily_end_time"), "daily_end_time"
        )
        if daily_timeframe_enabled and not (daily_start_time and daily_end_time):
            raise NotificationValidationError(
                "'daily_start_time' and 'daily_end_time' are required when "
                "'daily_timeframe_enabled' is true"
            )

        now = datetime.now(timezone.utc).isoformat()
        return cls(
            id=notification_id or str(uuid4()),
            name=name,
            message=message,
            category=category,
            active=bool(payload.get("active", True)),
            target_roles=target_roles,
            start_time=_parse_iso(payload.get("start_time"), "start_time"),
            end_time=_parse_iso(payload.get("end_time"), "end_time"),
            daily_timeframe_enabled=daily_timeframe_enabled,
            daily_start_time=daily_start_time,
            daily_end_time=daily_end_time,
            retrigger_interval_minutes=_parse_positive_int(
                payload.get("retrigger_interval_minutes"), "retrigger_interval_minutes"
            ),
            duration_seconds=_parse_positive_int(
                payload.get("duration_seconds"), "duration_seconds"
            ),
            created_on=created_on or now,
            changed_on=now,
        )

    def is_effective(self, now: datetime, user_role_names: set[str]) -> bool:
        """
        Whether this notification should be shown to a user with the given
        roles right now.
        """
        if not self.active:
            return False
        if self.target_roles and not (set(self.target_roles) & user_role_names):
            return False
        if self.start_time and now < datetime.fromisoformat(
            self.start_time.replace("Z", "+00:00")
        ):
            return False
        if self.end_time and now >= datetime.fromisoformat(
            self.end_time.replace("Z", "+00:00")
        ):
            return False
        if self.daily_timeframe_enabled and self.daily_start_time and self.daily_end_time:
            current = now.time()
            start = time.fromisoformat(self.daily_start_time)
            end = time.fromisoformat(self.daily_end_time)
            in_window = (
                start <= current < end
                if start <= end
                # an overnight window (e.g. 22:00-02:00) wraps past midnight
                else current >= start or current < end
            )
            if not in_window:
                return False
        return True
