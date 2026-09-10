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

from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable, TypeVar

from flask import g, request, Response
from flask_appbuilder.api import expose, protect, safe
from superset_core.rest_api.api import RestApi
from superset_core.rest_api.decorators import api

from . import storage
from .models import Notification, NotificationValidationError

F = TypeVar("F", bound=Callable[..., Any])


def _with_extension_context(func: F) -> F:
    """
    Establish ambient extension context for the duration of a request.

    Host gap, not a documented extension pattern: `@api`'s registration
    (`core_api_injection.py`'s `inject_rest_api_implementations`) captures
    the extension context only at class-decoration time (during extension
    loading) and stores it on `_api_metadata["context"]` -- it never
    re-establishes that context around an actual per-request dispatch to an
    `@expose`d method. Without this, every `get_context()` call in this
    file (including transitively, via `storage.py`) raises "must be called
    within an extension context" on every real request; confirmed via a
    live 500 against a running host, not just a read of the dispatch code.
    `self._api_metadata["context"]` is a stable, single instance captured
    once at module-import time (the extension module only loads once), so
    reusing it per-request is safe here.
    Reaches into `superset.extensions.context` (host internals, not the
    public `superset_core` SDK) as a stopgap; the real fix belongs in the
    host's REST dispatch, not in every extension author's own API class.
    Drop this the moment that lands.
    """

    @wraps(func)
    def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
        from superset.extensions.context import use_context

        with use_context(self._api_metadata["context"]):
            return func(self, *args, **kwargs)

    return wrapper  # type: ignore[return-value]


@api(
    id="community_notifications_api",
    name="In-App Notifications API",
    description="CRUD for admin-configured notifications, plus the "
    "current user's active-notification lookup",
)
class NotificationApi(RestApi):
    """
    CRUD endpoints (`can_list_notifications` / `can_create_notification` /
    `can_update_notification` / `can_delete_notification`) are meant for an
    admin management screen -- grant those permissions to trusted roles
    only. `get_active` (`can_get_active`) is the recipient-facing read: grant
    it to every role that should see in-app notifications (Gamma, Alpha,
    Admin, or a narrower custom role), independently of who can author them.
    """

    openapi_spec_tag = "In-App Notifications"
    class_permission_name = "community_notifications"

    @expose("/", methods=("GET",))
    @protect()
    @safe
    @_with_extension_context
    def list_notifications(self) -> Response:
        """Lists every configured notification, active or not.
        ---
        get:
          description: >-
            Get every configured notification, for the admin management
            screen.
          responses:
            200:
              description: List of notifications
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      result:
                        type: array
                        items:
                          type: object
            401:
              $ref: '#/components/responses/401'
        """
        return self.response(
            200, result=[n.to_dict() for n in storage.list_all()]
        )

    @expose("/", methods=("POST",))
    @protect()
    @safe
    @_with_extension_context
    def create_notification(self) -> Response:
        """Creates a new notification.
        ---
        post:
          description: >-
            Create a new notification.
          requestBody:
            content:
              application/json:
                schema:
                  type: object
          responses:
            201:
              description: Notification created
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      result:
                        type: object
            400:
              $ref: '#/components/responses/400'
            401:
              $ref: '#/components/responses/401'
        """
        try:
            notification = Notification.from_request(request.json or {})
        except NotificationValidationError as ex:
            return self.response(400, message=str(ex))
        storage.save(notification)
        return self.response(201, result=notification.to_dict())

    @expose("/<notification_id>", methods=("PUT",))
    @protect()
    @safe
    @_with_extension_context
    def update_notification(self, notification_id: str) -> Response:
        """Updates an existing notification.
        ---
        put:
          description: >-
            Update an existing notification.
          parameters:
          - in: path
            schema:
              type: string
            name: notification_id
          requestBody:
            content:
              application/json:
                schema:
                  type: object
          responses:
            200:
              description: Notification updated
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      result:
                        type: object
            400:
              $ref: '#/components/responses/400'
            401:
              $ref: '#/components/responses/401'
            404:
              $ref: '#/components/responses/404'
        """
        existing = storage.get(notification_id)
        if existing is None:
            return self.response(404, message="Notification not found")
        try:
            notification = Notification.from_request(
                request.json or {},
                notification_id=notification_id,
                created_on=existing.created_on,
            )
        except NotificationValidationError as ex:
            return self.response(400, message=str(ex))
        storage.save(notification)
        return self.response(200, result=notification.to_dict())

    @expose("/<notification_id>", methods=("DELETE",))
    @protect()
    @safe
    @_with_extension_context
    def delete_notification(self, notification_id: str) -> Response:
        """Deletes a notification.
        ---
        delete:
          description: >-
            Delete a notification.
          parameters:
          - in: path
            schema:
              type: string
            name: notification_id
          responses:
            200:
              description: Notification deleted
            401:
              $ref: '#/components/responses/401'
            404:
              $ref: '#/components/responses/404'
        """
        if storage.get(notification_id) is None:
            return self.response(404, message="Notification not found")
        storage.delete(notification_id)
        return self.response(200, result={"id": notification_id})

    @expose("/active", methods=("GET",))
    @protect()
    @safe
    @_with_extension_context
    def get_active(self) -> Response:
        """Notifications currently effective for the calling user.
        ---
        get:
          description: >-
            Get the notifications currently effective for the calling user,
            already filtered by active flag, role targeting, and time
            window/daily timeframe.
          responses:
            200:
              description: List of currently active notifications
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      result:
                        type: array
                        items:
                          type: object
            401:
              $ref: '#/components/responses/401'
        """
        user_role_names = {role.name for role in getattr(g.user, "roles", [])}
        now = datetime.now(timezone.utc)
        active = [
            n for n in storage.list_all() if n.is_effective(now, user_role_names)
        ]
        return self.response(200, result=[n.to_dict() for n in active])
