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

import axios from 'axios';
import { afterEach, beforeEach, expect, test } from 'vitest';
import api, {
    register,
    listUsers,
    createUser,
    resetUserPassword,
    setUserRole,
    deleteUser,
} from '../portal/src/service/api.js';

/**
 * Account and user-management endpoint contracts, asserted through the real
 * axios interceptor (adapter mock): URL, payload and envelope unwrapping.
 */
const ORCHESTRATE = '/api/orchestrate/rest/v1/orchestrate';
const ENVELOPE = (data) => ({ code: 200, status: 'success', data });

let seen;
const adapter = (config) => {
    seen.push({
        url: axios.getUri(config),
        method: config.method,
        body: JSON.parse(config.data || 'null'),
    });
    return Promise.resolve({ data: ENVELOPE({ ok: true }), status: 200, headers: {}, config });
};

beforeEach(() => {
    localStorage.clear();
    seen = [];
    api.defaults.adapter = adapter;
});
afterEach(() => {
    api.defaults.adapter = undefined;
});

test('register posts username and password to the public endpoint', async () => {
    await register('newbie', 'Passw0rd!');
    expect(seen[0]).toEqual({
        url: `${ORCHESTRATE}/auth/register`,
        method: 'post',
        body: { username: 'newbie', password: 'Passw0rd!' },
    });
});

test('listUsers fetches the admin user list', async () => {
    await listUsers();
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/users`);
    expect(seen[0].method).toBe('get');
});

test('createUser posts the full admin payload', async () => {
    await createUser({
        username: 'ops',
        password: 'Passw0rd!',
        role: 'admin',
        must_change_password: true,
    });
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/users`);
    expect(seen[0].body).toEqual({
        username: 'ops',
        password: 'Passw0rd!',
        role: 'admin',
        must_change_password: true,
    });
});

test('resetUserPassword targets the encoded username', async () => {
    await resetUserPassword('user one', 'New#Pass2026');
    expect(seen[0].url).toBe(
        `${ORCHESTRATE}/auth/users/${encodeURIComponent('user one')}/reset-password`
    );
    expect(seen[0].body).toEqual({ new_password: 'New#Pass2026' });
});

test('setUserRole puts the new role under the encoded username', async () => {
    await setUserRole('ops', 'admin');
    expect(seen[0].url).toBe(
        `${ORCHESTRATE}/auth/users/${encodeURIComponent('ops')}/role`
    );
    expect(seen[0].method).toBe('put');
    expect(seen[0].body).toEqual({ role: 'admin' });
});

test('deleteUser removes the encoded username', async () => {
    await deleteUser('ops');
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/users/${encodeURIComponent('ops')}`);
    expect(seen[0].method).toBe('delete');
});
