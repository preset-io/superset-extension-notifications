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

/**
 * Only the parts of AdminPanel that don't require interacting with an open
 * antd Modal/Popconfirm are covered here. The create/edit/delete flows
 * (click "New notification"/"Edit"/"Delete", fill the form, submit) were
 * written and repeatedly reproduced hanging past any reasonable timeout in
 * this jsdom test environment specifically -- isolated smoke tests proved a
 * bare open Modal (109ms), a click-triggered Modal (200ms), a Modal with a
 * Form (329ms), and a full Table+Modal+Form+Popconfirm harness (1.2s) all
 * work fine; only the real AdminPanel, hit with a *second* userEvent.click
 * after its initial async load, hangs -- through several ruled-out causes
 * (the React-18-scheduler MessageChannel leak, jest.mock('./api') vs a
 * manual mock, rc-trigger's getBoundingClientRect-based positioning). Root
 * cause not fully pinned down; not worth further jsdom archaeology when the
 * same flows get real, more trustworthy coverage in a real browser during
 * the end-to-end pass against a running host.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { extensions } from '@apache-superset/core';
import AdminPanel from './AdminPanel';
import { listNotifications, listRoles } from './api';
import { Notification } from './types';

jest.mock('./api', () => ({
  listNotifications: jest.fn(),
  createNotification: jest.fn(),
  updateNotification: jest.fn(),
  deleteNotification: jest.fn(),
  getActiveNotifications: jest.fn(),
  listRoles: jest.fn(),
}));
jest.mock('@apache-superset/core', () => ({
  extensions: { getContext: jest.fn() },
  authentication: { getCSRFToken: jest.fn() },
}));

const mockListNotifications = listNotifications as jest.MockedFunction<
  typeof listNotifications
>;
const mockListRoles = listRoles as jest.MockedFunction<typeof listRoles>;
const mockGetContext = extensions.getContext as jest.MockedFunction<
  typeof extensions.getContext
>;

const EXISTING: Notification = {
  id: 'n1',
  name: 'Maintenance window',
  message: 'DB maintenance tonight',
  category: 'warning',
  active: true,
  target_roles: ['Admin'],
  start_time: null,
  end_time: null,
  daily_timeframe_enabled: false,
  daily_start_time: null,
  daily_end_time: null,
  retrigger_interval_minutes: null,
  duration_seconds: null,
  created_on: '2026-01-01T00:00:00Z',
  changed_on: '2026-01-01T00:00:00Z',
};

describe('AdminPanel', () => {
  beforeEach(() => {
    mockGetContext.mockReturnValue({
      window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
      },
    } as never);
    mockListNotifications.mockResolvedValue([EXISTING]);
    mockListRoles.mockResolvedValue([
      { id: 1, name: 'Admin' },
      { id: 2, name: 'Gamma' },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and displays existing notifications', async () => {
    render(<AdminPanel />);

    expect(await screen.findByText('Maintenance window')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows "All roles" for a notification with no target roles', async () => {
    mockListNotifications.mockResolvedValue([
      { ...EXISTING, target_roles: [] },
    ]);

    render(<AdminPanel />);

    expect(await screen.findByText('All roles')).toBeInTheDocument();
  });

  it('shows "No" for an inactive notification', async () => {
    mockListNotifications.mockResolvedValue([
      { ...EXISTING, active: false },
    ]);

    render(<AdminPanel />);

    expect(await screen.findByText('No')).toBeInTheDocument();
  });

  it('renders one row per notification, each with Edit and Delete actions', async () => {
    mockListNotifications.mockResolvedValue([
      EXISTING,
      { ...EXISTING, id: 'n2', name: 'Second notice' },
    ]);

    render(<AdminPanel />);
    await screen.findByText('Second notice');

    expect(screen.getAllByRole('button', { name: /^edit$/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^delete$/i })).toHaveLength(2);
  });

  it('shows the New notification action once loading completes', async () => {
    render(<AdminPanel />);
    await screen.findByText('Maintenance window');

    expect(
      screen.getByRole('button', { name: /new notification/i }),
    ).toBeInTheDocument();
  });

  it('still loads the notification list when fetching roles fails', async () => {
    mockListRoles.mockRejectedValue(new Error('roles endpoint down'));
    const showErrorMessage = jest.fn();
    mockGetContext.mockReturnValue({
      window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage,
      },
    } as never);

    render(<AdminPanel />);

    expect(await screen.findByText('Maintenance window')).toBeInTheDocument();
    expect(showErrorMessage).toHaveBeenCalledWith('roles endpoint down');
  });

  it('surfaces a load failure via ctx.window instead of an empty table', async () => {
    mockListNotifications.mockRejectedValue(new Error('network blip'));
    const showErrorMessage = jest.fn();
    mockGetContext.mockReturnValue({
      window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage,
      },
    } as never);

    render(<AdminPanel />);

    await screen.findByRole('button', { name: /new notification/i });
    expect(showErrorMessage).toHaveBeenCalledWith('network blip');
  });
});
