// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
//    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
//    License for the specific language governing permissions and limitations
//    under the License.

import { describe, it, expect } from 'vitest';
import { loadRemotePlugin } from '../src/remote-loader.js';

/**
 * loadRemotePlugin dynamically imports modules over http:// URLs, which the
 * Node/vitest runtime cannot resolve — every call is expected to reject with
 * an error naming the plugin id and its mapped dev-server URL.
 */
describe('loadRemotePlugin', () => {
    it.each([
        ['registry-center', 5100],
        ['orchestration-center', 5101],
        ['execution-center', 5102],
    ])('rejects for "%s" with its mapped port %s', async (id, port) => {
        await expect(loadRemotePlugin({ id })).rejects.toThrow(
            `Failed to load remote plugin "${id}" from http://localhost:${port}`
        );
    });

    it('falls back to port 5100 for unknown plugin ids', async () => {
        await expect(
            loadRemotePlugin({ id: 'some-unknown-plugin' })
        ).rejects.toThrow(
            'Failed to load remote plugin "some-unknown-plugin" from http://localhost:5100'
        );
    });
});
