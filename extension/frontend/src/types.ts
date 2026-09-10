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

/** Mirrors `backend/src/community/notifications/models.py`'s `Notification`. */
export type NotificationCategory = 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  name: string;
  message: string;
  category: NotificationCategory;
  active: boolean;
  target_roles: string[];
  start_time: string | null;
  end_time: string | null;
  daily_timeframe_enabled: boolean;
  daily_start_time: string | null;
  daily_end_time: string | null;
  retrigger_interval_minutes: number | null;
  duration_seconds: number | null;
  created_on: string | null;
  changed_on: string | null;
}

/** The subset of `Notification` an admin actually supplies; the rest
 * (`id`, `created_on`, `changed_on`) is server-assigned. */
export type NotificationDraft = Omit<
  Notification,
  'id' | 'created_on' | 'changed_on'
>;
