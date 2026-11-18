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

import { menus, views } from '@apache-superset/core';
import AdminPanel from './AdminPanel';
import { startNotificationPolling } from './useNotificationPolling';

// Page ids must start with this extension's id (`community.notifications`).
const ADMIN_PAGE_ID = 'community.notifications.admin';

// The admin screen is an extension page (SIP-235): served at
// `/extensions/pages/community.notifications.admin`, and only shown to users
// who can list notifications through this extension's own API, which is the
// same permission guarding the data behind it.
views.registerView(
  { id: ADMIN_PAGE_ID, name: 'In-App Notifications' },
  views.Locations.page,
  AdminPanel,
  {
    classPermissionName: 'community_notifications',
    methodPermissionName: 'list_notifications',
  },
);

menus.registerMenuItem(
  {
    page: ADMIN_PAGE_ID,
    icon: 'BellOutlined',
    description: 'Manage admin-configured in-app notifications',
  },
  menus.Locations.settingsMenu,
  'primary',
);

startNotificationPolling();
