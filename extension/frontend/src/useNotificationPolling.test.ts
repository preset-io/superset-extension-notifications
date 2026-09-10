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
import { startNotificationPolling } from './useNotificationPolling';
import { Notification } from './types';

jest.mock('./api');
jest.mock('@apache-superset/core', () => ({
  extensions: { getContext: jest.fn() },
}));

const mockGetActiveNotifications = getActiveNotifications as jest.MockedFunction<
  typeof getActiveNotifications
>;
const mockGetContext = extensions.getContext as jest.MockedFunction<
  typeof extensions.getContext
>;

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  name: 'Maintenance',
  message: 'DB maintenance tonight',
  category: 'info',
  active: true,
  target_roles: [],
  start_time: null,
  end_time: null,
  daily_timeframe_enabled: false,
  daily_start_time: null,
  daily_end_time: null,
  retrigger_interval_minutes: null,
  duration_seconds: null,
  created_on: null,
  changed_on: null,
  ...overrides,
});

describe('startNotificationPolling', () => {
  let localStore: Map<string, number>;
  let ctx: {
    window: {
      showInformationMessage: jest.Mock;
      showWarningMessage: jest.Mock;
      showErrorMessage: jest.Mock;
    };
    storage: { local: { get: jest.Mock; set: jest.Mock } };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    localStore = new Map();
    ctx = {
      window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
      },
      storage: {
        local: {
          get: jest.fn((key: string) => Promise.resolve(localStore.get(key) ?? null)),
          set: jest.fn((key: string, value: number) => {
            localStore.set(key, value);
            return Promise.resolve();
          }),
        },
      },
    };
    mockGetContext.mockReturnValue(ctx as never);
    mockGetActiveNotifications.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const flush = async () => {
    // Let the in-flight promise chain from the poll tick resolve.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('shows a new notification on the first poll', async () => {
    mockGetActiveNotifications.mockResolvedValue([makeNotification()]);

    const stop = startNotificationPolling();
    await flush();

    expect(ctx.window.showInformationMessage).toHaveBeenCalledWith(
      'DB maintenance tonight',
    );
    stop();
  });

  it('routes each category to the matching window method', async () => {
    mockGetActiveNotifications.mockResolvedValue([
      makeNotification({ id: 'warn', category: 'warning', message: 'careful' }),
      makeNotification({ id: 'err', category: 'error', message: 'uh oh' }),
    ]);

    const stop = startNotificationPolling();
    await flush();

    expect(ctx.window.showWarningMessage).toHaveBeenCalledWith('careful');
    expect(ctx.window.showErrorMessage).toHaveBeenCalledWith('uh oh');
    stop();
  });

  it('does not re-show a notification with no retrigger interval', async () => {
    mockGetActiveNotifications.mockResolvedValue([makeNotification()]);

    const stop = startNotificationPolling();
    await flush();
    expect(ctx.window.showInformationMessage).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5 * 60 * 1000);
    await flush();

    expect(ctx.window.showInformationMessage).toHaveBeenCalledTimes(1);
    stop();
  });

  it('re-shows a notification once its retrigger interval elapses', async () => {
    mockGetActiveNotifications.mockResolvedValue([
      makeNotification({ retrigger_interval_minutes: 10 }),
    ]);

    const stop = startNotificationPolling();
    await flush();
    expect(ctx.window.showInformationMessage).toHaveBeenCalledTimes(1);

    // Still under 10 minutes: one more 5-minute poll shouldn't re-show.
    jest.advanceTimersByTime(5 * 60 * 1000);
    await flush();
    expect(ctx.window.showInformationMessage).toHaveBeenCalledTimes(1);

    // Now past 10 minutes total: due again.
    jest.advanceTimersByTime(5 * 60 * 1000);
    await flush();
    expect(ctx.window.showInformationMessage).toHaveBeenCalledTimes(2);

    stop();
  });

  it('stops polling once the returned teardown is called', async () => {
    const stop = startNotificationPolling();
    await flush();
    mockGetActiveNotifications.mockClear();

    stop();
    jest.advanceTimersByTime(30 * 60 * 1000);
    await flush();

    expect(mockGetActiveNotifications).not.toHaveBeenCalled();
  });

  it('swallows a failed poll instead of throwing', async () => {
    mockGetActiveNotifications.mockRejectedValueOnce(new Error('network blip'));

    const stop = startNotificationPolling();
    await flush();

    expect(ctx.window.showInformationMessage).not.toHaveBeenCalled();
    stop();
  });
});
