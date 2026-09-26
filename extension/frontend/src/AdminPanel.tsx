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

import React, { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import { extensions } from '@apache-superset/core';
import {
  createNotification,
  deleteNotification,
  listNotifications,
  listRoles,
  Role,
  updateNotification,
} from './api';
import { Notification, NotificationDraft } from './types';

const CATEGORY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const EMPTY_DRAFT: NotificationDraft = {
  name: '',
  message: '',
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
};

/**
 * Admin management screen for notifications, registered as a
 * `GlobalLocations.settings.panel` view (see `index.tsx`). Reachable at
 * `/extensions/view/community.notifications.admin` via the "Extensions"
 * group the host adds to the Settings dropdown.
 */
const AdminPanel: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<NotificationDraft>();

  const ctx = extensions.getContext();

  const refresh = async () => {
    setLoading(true);
    try {
      setNotifications(await listNotifications());
    } catch (err) {
      ctx.window.showErrorMessage(
        err instanceof Error ? err.message : 'Failed to load notifications',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Role names for the Target Roles picker below. A failure here isn't
    // fatal to the rest of the screen -- the Select still accepts free-typed
    // role names via its `mode="tags"`, just without autocomplete -- so it's
    // reported but doesn't block loading the notification list.
    listRoles()
      .then(setRoles)
      .catch(err =>
        ctx.window.showErrorMessage(
          err instanceof Error ? err.message : 'Failed to load roles',
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue(EMPTY_DRAFT);
    setModalOpen(true);
  };

  const openEdit = (notification: Notification) => {
    setEditing(notification);
    form.setFieldsValue(notification);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      ctx.window.showInformationMessage('Notification deleted');
      refresh();
    } catch (err) {
      ctx.window.showErrorMessage(
        err instanceof Error ? err.message : 'Failed to delete notification',
      );
    }
  };

  const handleSubmit = async () => {
    const draft = (await form.validateFields()) as NotificationDraft;
    try {
      if (editing) {
        await updateNotification(editing.id, draft);
        ctx.window.showInformationMessage('Notification updated');
      } else {
        await createNotification(draft);
        ctx.window.showInformationMessage('Notification created');
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      ctx.window.showErrorMessage(
        err instanceof Error ? err.message : 'Failed to save notification',
      );
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (category: Notification['category']) => <Tag>{category}</Tag>,
    },
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean) => (active ? 'Yes' : 'No'),
    },
    {
      title: 'Target roles',
      dataIndex: 'target_roles',
      key: 'target_roles',
      render: (roles: string[]) => (roles.length ? roles.join(', ') : 'All roles'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Notification) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this notification?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          New notification
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={notifications}
      />
      <Modal
        title={editing ? 'Edit notification' : 'New notification'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={EMPTY_DRAFT}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="message" label="Message" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="target_roles"
            label="Target roles"
            tooltip="Leave empty to target every role"
          >
            <Select
              mode="tags"
              tokenSeparators={[',']}
              options={roles.map(role => ({ value: role.name, label: role.name }))}
              placeholder="Select or type role names"
            />
          </Form.Item>
          <Form.Item name="start_time" label="Start time (ISO-8601, optional)">
            <Input placeholder="2026-09-01T00:00:00Z" />
          </Form.Item>
          <Form.Item name="end_time" label="End time (ISO-8601, optional)">
            <Input placeholder="2026-09-30T23:59:59Z" />
          </Form.Item>
          <Form.Item
            name="daily_timeframe_enabled"
            label="Restrict to a daily timeframe"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="daily_start_time" label="Daily start (HH:MM)">
            <Input placeholder="09:00" />
          </Form.Item>
          <Form.Item name="daily_end_time" label="Daily end (HH:MM)">
            <Input placeholder="17:00" />
          </Form.Item>
          <Form.Item
            name="retrigger_interval_minutes"
            label="Re-show after (minutes)"
            tooltip="Leave blank to show a user this notification only once, ever. 0 shows it again on every page load. Any other number waits that many minutes before showing it again."
          >
            {/* antd's plain Input with type="number" reports its value as a
                string, which the backend's isinstance(value, int) check
                then rejects outright -- including 0, the field's own
                documented "every page load" case. InputNumber reports a
                real number and must stay InputNumber here. */}
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              placeholder="Blank = once only, 0 = every page load"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPanel;
