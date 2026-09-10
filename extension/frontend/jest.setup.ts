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

import '@testing-library/jest-dom';

// React 18's scheduler reaches for the global `MessageChannel` (used for
// posting low-priority work); jsdom's window doesn't expose one. Node's own
// `worker_threads` MessageChannel is a real option, but its round trip
// through libuv doesn't reliably signal back into jsdom's microtask queue
// from inside an interactive `userEvent` sequence -- observed as
// `act()`/`findByRole` hanging until the test timeout on any click that
// opens a portal component (Modal, Popconfirm), rather than resolving in
// milliseconds. A synchronous, microtask-based shim avoids that live-lock
// entirely and is all `scheduler` actually needs from it in a test
// environment (delivering low-priority callbacks isn't timing-sensitive
// here the way it is in a real browser).
if (typeof window.MessageChannel === 'undefined') {
  class ShimMessagePort {
    onmessage: ((event: { data: unknown }) => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private target: ShimMessagePort | null = null;

    linkTo(target: ShimMessagePort) {
      this.target = target;
    }

    postMessage(data: unknown) {
      Promise.resolve().then(() => this.target?.onmessage?.({ data }));
    }

    start() {}

    close() {}
  }

  class ShimMessageChannel {
    port1 = new ShimMessagePort();

    port2 = new ShimMessagePort();

    constructor() {
      this.port1.linkTo(this.port2);
      this.port2.linkTo(this.port1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).MessageChannel = ShimMessageChannel;
}

// antd's responsive utilities (Modal, Grid) call matchMedia; jsdom doesn't
// implement it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// rc-trigger (Popconfirm, Select's dropdown, Tooltip) positions its popup by
// measuring the trigger element via getBoundingClientRect; jsdom never lays
// anything out, so every element measures 0x0 and rc-trigger's alignment
// logic never reaches the "stable" measurement it waits for -- observed as
// a Popconfirm's "Yes"/"No" buttons, or a Select-containing form, never
// actually finishing their first render pass in a test.
Element.prototype.getBoundingClientRect = () => ({
  width: 100,
  height: 40,
  top: 0,
  left: 0,
  right: 100,
  bottom: 40,
  x: 0,
  y: 0,
  toJSON() {
    return this;
  },
});

// antd's Table/Modal observe element size; jsdom doesn't implement
// ResizeObserver either.
class ResizeObserverStub {
  observe() {}

  unobserve() {}

  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ResizeObserver = ResizeObserverStub;
