/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { authentication } from '@apache-superset/core';
import { Notification, NotificationDraft } from './types';

/**
 * Extension REST routes resolve under `/extensions/{publisher}/{name}/`
 * (see `backend/src/community/notifications/api.py`'s `@api` registration
 * and the quick-start docs' path-resolution example).
 */
const BASE_URL = '/extensions/community/notifications';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrfToken = await authentication.getCSRFToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken ?? '',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  const body = await response.json();
  return body.result as T;
}

export const listNotifications = (): Promise<Notification[]> =>
  request<Notification[]>('/');

export const getActiveNotifications = (): Promise<Notification[]> =>
  request<Notification[]>('/active');

export const createNotification = (
  draft: NotificationDraft,
): Promise<Notification> =>
  request<Notification>('/', { method: 'POST', body: JSON.stringify(draft) });

export const updateNotification = (
  id: string,
  draft: NotificationDraft,
): Promise<Notification> =>
  request<Notification>(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });

export const deleteNotification = (id: string): Promise<void> =>
  request<void>(`/${id}`, { method: 'DELETE' });

export interface Role {
  id: number;
  name: string;
}

/**
 * Lists Superset's configured roles, for the Target Roles picker in
 * `AdminPanel`. Hits the host's own `/api/v1/security/roles/` (not this
 * extension's `/extensions/...` prefix -- role listing is core Superset
 * data, not something this extension owns) so admins can pick real role
 * names instead of guessing/typing them from memory.
 */
export const listRoles = async (): Promise<Role[]> => {
  const csrfToken = await authentication.getCSRFToken();
  const response = await fetch('/api/v1/security/roles/?q=(page_size:100)', {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken ?? '',
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const body = await response.json();
  return body.result as Role[];
};
