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

import { commands, menus, views } from '@apache-superset/core';
import AdminPanel from './AdminPanel';
import { startNotificationPolling } from './useNotificationPolling';

const ADMIN_VIEW_ID = 'community.notifications.admin';
const OPEN_ADMIN_COMMAND_ID = 'community.notifications.openAdmin';

// Requires the Phase-0 core diff (branch `feat/extensions-notifications-poc`
// on apache/superset, PR #44101): `GlobalLocations.settings.{menu,panel}`
// and `ExtensionContext.window`. Not yet on `master`.
const GLOBAL_SETTINGS_MENU = 'global.settingsMenu';
const GLOBAL_SETTINGS_PANEL = 'global.settingsPanel';

views.registerView(
  { id: ADMIN_VIEW_ID, name: 'In-App Notifications' },
  GLOBAL_SETTINGS_PANEL,
  AdminPanel,
);

commands.registerCommand(
  {
    id: OPEN_ADMIN_COMMAND_ID,
    title: 'In-App Notifications',
    description: 'Manage admin-configured in-app notifications',
  },
  () => {
    // No SPA navigation primitive is exposed to extensions yet (see
    // `@apache-superset/core`'s `navigation` namespace, which is read-only
    // page-surface introspection, not a `navigate()` call) -- a full
    // location change is the only way to reach the host-rendered
    // `/extensions/view/:viewId` route from here.
    window.location.assign(`/extensions/view/${ADMIN_VIEW_ID}`);
  },
);

menus.registerMenuItem(
  { view: ADMIN_VIEW_ID, command: OPEN_ADMIN_COMMAND_ID },
  GLOBAL_SETTINGS_MENU,
  'primary',
);

startNotificationPolling();
