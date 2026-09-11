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

import { extensions } from '@apache-superset/core';
import { getActiveNotifications } from './api';
import { Notification, NotificationCategory } from './types';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const LAST_SHOWN_KEY_PREFIX = 'lastShown:';

type ExtensionCtx = ReturnType<typeof extensions.getContext>;

const showToast = (ctx: ExtensionCtx, notification: Notification) => {
  const showByCategory: Record<NotificationCategory, (message: string) => void> = {
    info: ctx.window.showInformationMessage,
    warning: ctx.window.showWarningMessage,
    error: ctx.window.showErrorMessage,
  };
  showByCategory[notification.category](notification.message);
};

/**
 * Polls the active-notifications endpoint and surfaces new/retriggered ones
 * as toasts. Call once, from the extension's activation entry point
 * (`index.tsx`); the returned function tears the poll loop down.
 *
 * "Last shown" state is tracked client-side in `ctx.storage.local`
 * (per-browser) rather than server-side: Tier 3 has no per-recipient
 * delivery-state concept (see `Notification.retrigger_interval_minutes` in
 * the backend model), and this is inherently a per-viewer UX concern, not
 * data an admin needs to query.
 *
 * `Notification.duration_seconds` from the SIP mockups isn't applied here --
 * the Phase-0 `ExtensionContext.window` surface (`show*Message(message)`)
 * takes no duration parameter yet. That's a gap in the Phase-0 core diff to
 * close later, not something to work around here.
 */
export function startNotificationPolling(): () => void {
  const ctx = extensions.getContext();
  let cancelled = false;

  const poll = async () => {
    let active: Notification[];
    try {
      active = await getActiveNotifications();
    } catch {
      // A transient failure (network blip, role not yet granted
      // `can_get_active`) shouldn't spam the user or break the poll loop --
      // skip this cycle and try again next interval.
      return;
    }
    if (cancelled) {
      return;
    }

    await Promise.all(
      active.map(async notification => {
        const key = `${LAST_SHOWN_KEY_PREFIX}${notification.id}`;
        const lastShown = await ctx.storage.local.get<number>(key);
        const { retrigger_interval_minutes: retrigger } = notification;
        // `?? 0` here would collapse "unset" (never re-show) and "0"
        // (re-show on every poll) into the same behavior, since `0 * 60000`
        // and `null * 60000`-via-fallback both evaluate falsy. Checking
        // `retrigger != null` instead keeps 0 meaningful: elapsed time
        // since any past timestamp is always >= 0, so a 0-minute interval
        // is effectively "every page load" (each load re-mounts this hook,
        // which polls immediately -- see the bottom of this function).
        const due =
          lastShown == null ||
          (retrigger != null && Date.now() - lastShown >= retrigger * 60 * 1000);
        if (!due) {
          return;
        }
        showToast(ctx, notification);
        await ctx.storage.local.set(key, Date.now());
      }),
    );
  };

  poll();
  const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}
