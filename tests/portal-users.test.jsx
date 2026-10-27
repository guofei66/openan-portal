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

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authCheck: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(async () => {}),
    changePassword: vi.fn(async () => {}),
    register: vi.fn(),
    listUsers: vi.fn(),
    createUser: vi.fn(async () => ({})),
    resetUserPassword: vi.fn(async () => ({})),
    setUserRole: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => ({})),
    getDisabledPlugins: vi.fn(),
    setDisabledPlugins: vi.fn(async () => ({})),
}));
vi.mock('../portal/src/service/api.js', () => ({
    default: { get: vi.fn(), post: vi.fn() },
    createApi: vi.fn(() => ({ get: vi.fn() })),
    authCheck: mocks.authCheck,
    login: mocks.login,
    logout: mocks.logout,
    changePassword: mocks.changePassword,
    register: mocks.register,
    listUsers: mocks.listUsers,
    createUser: mocks.createUser,
    resetUserPassword: mocks.resetUserPassword,
    setUserRole: mocks.setUserRole,
    deleteUser: mocks.deleteUser,
    getDisabledPlugins: mocks.getDisabledPlugins,
    setDisabledPlugins: mocks.setDisabledPlugins,
}));
import {
    register as apiRegister,
    listUsers as apiListUsers,
    createUser as apiCreateUser,
    resetUserPassword as apiResetUserPassword,
    setUserRole as apiSetUserRole,
    deleteUser as apiDeleteUser,
    getDisabledPlugins as apiGetDisabledPlugins,
    setDisabledPlugins as apiSetDisabledPlugins,
} from '../portal/src/service/api.js';
import { PortalApp } from '../portal/src/PortalApp.jsx';
import i18n from '../portal/src/i18n/index.js';

let node, root;
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const Content = () => <div>HEALTHY_CONTENT</div>;
const plugin = (id) => ({
    id,
    enabled: true,
    manifest: async () => ({
        default: {
            id,
            name: id,
            version: '1.0.0',
            menu: [{ id, route: `/${id}`, labelKey: id }],
            routes: [{ path: `/${id}`, component: async () => ({ default: Content }) }],
        },
    }),
});
const render = async (plugins) => {
    await act(async () => root.render(<PortalApp pluginsConfig={{ plugins }} />));
    await flush();
};
const buttons = (text) => [...node.querySelectorAll('button')].filter((b) => b.textContent === text);
const click = async (button) => {
    expect(button, `button not found: ${button?.textContent}`).toBeTruthy();
    await act(async () => Simulate.click(button));
    await flush();
};
const clickByText = async (text) => {
    const found = buttons(text);
    expect(found.length, `expected one "${text}" button`).toBeGreaterThanOrEqual(1);
    await click(found[0]);
};
const change = async (input, value) => {
    expect(input, `input not found for value ${value}`).toBeTruthy();
    await act(async () => Simulate.change(input, { target: { value } }));
};
const byPlaceholder = (text) => [...node.querySelectorAll('input')].find((i) => i.placeholder === text);

const USERS = [
    { username: 'admin', role: 'admin', must_change_password: false, created_at: '2026-10-27T06:30:00Z' },
    { username: 'ops', role: 'user', must_change_password: true, created_at: '2026-10-27T08:00:00Z' },
];

beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    node = document.createElement('div');
    document.body.appendChild(node);
    root = createRoot(node);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default: guest browsing available as an explicit choice, registration
    // open. Visitors still land on the login card by default.
    mocks.authCheck.mockResolvedValue({ auth_required: true, guest_allowed: true, registration_enabled: true });
    mocks.register.mockResolvedValue({});
    mocks.listUsers.mockResolvedValue(USERS);
    // Default: the account has already saved (empty) plugin preferences.
    mocks.getDisabledPlugins.mockResolvedValue({ disabled_plugins: [], stored: true });
});
afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
});

test('visitors land on the login card and may opt into guest browsing', async () => {
    await render([plugin('healthy')]);
    // Login is required by default: the portal itself is not rendered yet.
    expect(node.textContent).toContain('Access Password');
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
    // The guest entry is offered below the login card.
    expect(buttons('No account? Browse as guest →')).toHaveLength(1);

    await clickByText('No account? Browse as guest →');
    expect(node.textContent).toContain('HEALTHY_CONTENT');
    expect(node.textContent).toContain('Guest');
    expect(buttons('Login')).toHaveLength(1);
    expect(buttons('Register')).toHaveLength(1);
});

test('an expired authenticated session returns to the login card', async () => {
    mocks.login.mockResolvedValue({ username: 'boss', role: 'admin', must_change_password: false });
    await render([plugin('healthy')]);
    await clickByText('No account? Browse as guest →');
    await clickByText('Login');
    const dialog = node.querySelector('[role=dialog]');
    await change(dialog.querySelector('input[type=text]'), 'boss');
    await change(byPlaceholder('Enter access password...'), 'pw');
    await act(async () => Simulate.submit(dialog.querySelector('form')));
    await flush();
    expect(node.textContent).toContain('HEALTHY_CONTENT');

    await act(async () => window.dispatchEvent(new Event('auth-expired')));
    await flush();
    expect(node.textContent).toContain('Access Password');
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
});

test('visitors can register from the guest dialog and are sent back to the login form', async () => {
    await render([plugin('healthy')]);
    await clickByText('No account? Browse as guest →');
    await clickByText('Register');

    const dialog = node.querySelector('[role=dialog]');
    expect(dialog).toBeTruthy();
    await change(dialog.querySelector('input[type=text]'), 'newbie');
    await change(byPlaceholder('Password (min 8 chars, letters and digits)'), 'Passw0rd!');
    await change(dialog.querySelectorAll('input[type=password]')[1], 'Passw0rd!');
    await act(async () => Simulate.submit(dialog.querySelector('form')));

    expect(apiRegister).toHaveBeenCalledWith('newbie', 'Passw0rd!');
    expect(dialog.textContent).toContain('Registered. Please sign in with your new account');
    // The card returned to the login tab.
    expect(dialog.textContent).toContain('Access Password');
});

test('logging in from the guest dialog opens the admin user management page', async () => {
    mocks.login.mockResolvedValue({ username: 'boss', role: 'admin', must_change_password: false });
    await render([plugin('healthy')]);
    await clickByText('No account? Browse as guest →');

    await clickByText('Login');
    const dialog = node.querySelector('[role=dialog]');
    await change(dialog.querySelector('input[type=text]'), 'boss');
    await change(byPlaceholder('Enter access password...'), 's3cret');
    await act(async () => Simulate.submit(dialog.querySelector('form')));
    await flush();

    // Modal closed, header shows the user with the admin entry.
    expect(node.querySelector('[role=dialog]')).toBe(null);
    expect(node.textContent).toContain('boss');
    // The authenticated header is exclusive: no guest badge and no
    // login/register entries remain once a real session exists.
    expect(buttons('Login')).toHaveLength(0);
    expect(buttons('Register')).toHaveLength(0);
    expect(node.textContent).not.toContain('Guest');
    await clickByText('User Management');
    expect(window.location.pathname).toBe('/users');
    expect(apiListUsers).toHaveBeenCalled();
    expect(node.textContent).toContain('Create User');

    // Create a user with role admin and forced password change.
    await change(byPlaceholder('Username'), 'ops');
    await change(byPlaceholder('Password'), 'Passw0rd!');
    await act(async () => Simulate.submit(node.querySelector('form')));
    expect(apiCreateUser).toHaveBeenCalledWith({
        username: 'ops',
        password: 'Passw0rd!',
        role: 'user',
        must_change_password: true,
    });
});

test('admins can reset a password, switch a role and delete a user', async () => {
    mocks.authCheck.mockResolvedValue({ auth_required: true, authenticated: true, username: 'boss', role: 'admin' });
    window.history.replaceState({}, '', '/users');
    await render([plugin('healthy')]);

    expect(apiListUsers).toHaveBeenCalled();
    // Reset password through the inline dialog.
    await clickByText('Reset password');
    const resetForm = [...node.querySelectorAll('form')].find((f) =>
        f.textContent.includes('Set a new password for ops')
    );
    await change(resetForm.querySelector('input[type=password]'), 'New#Pass2026');
    await act(async () => Simulate.submit(resetForm));
    expect(apiResetUserPassword).toHaveBeenCalledWith('ops', 'New#Pass2026');

    // Switch the ops row role to admin (the seeded admin row has no select).
    const opsRow = [...node.querySelectorAll('tbody tr')].find((r) =>
        r.textContent.includes('ops')
    );
    await act(async () => Simulate.change(opsRow.querySelector('select'), { target: { value: 'admin' } }));
    expect(apiSetUserRole).toHaveBeenCalledWith('ops', 'admin');

    // Two-step delete confirmation.
    await clickByText('Delete');
    await clickByText('Confirm delete');
    expect(apiDeleteUser).toHaveBeenCalledWith('ops');
});

test('non-admin users never reach the user management route', async () => {
    mocks.authCheck.mockResolvedValue({ auth_required: true, authenticated: true, username: 'worker', role: 'user' });
    window.history.replaceState({}, '', '/users');
    await render([plugin('healthy')]);

    // Redirected to the first plugin route without the admin page or menu.
    expect(window.location.pathname).toBe('/healthy');
    expect(node.textContent).toContain('HEALTHY_CONTENT');
    expect(node.textContent).not.toContain('Create User');
    expect(buttons('User Management')).toHaveLength(0);
    // The self-service change-password entry is still offered.
    expect(buttons('Change Password')).toHaveLength(1);
});

test('logging out returns to the login card', async () => {
    mocks.login.mockResolvedValue({ username: 'boss', role: 'admin', must_change_password: false });
    await render([plugin('healthy')]);
    await clickByText('No account? Browse as guest →');
    await clickByText('Login');
    const dialog = node.querySelector('[role=dialog]');
    await change(dialog.querySelector('input[type=text]'), 'boss');
    await change(byPlaceholder('Enter access password...'), 'pw');
    await act(async () => Simulate.submit(dialog.querySelector('form')));
    await flush();
    expect(node.textContent).toContain('boss');

    await clickByText('Logout');
    expect(node.textContent).toContain('Access Password');
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
    expect(node.textContent).not.toContain('boss');
});

test('registration-disabled servers show a plain login card with the guest entry', async () => {
    mocks.authCheck.mockResolvedValue({ auth_required: true, guest_allowed: true, registration_enabled: false });
    await render([plugin('healthy')]);
    expect(node.textContent).toContain('Access Password');
    // No register tab or create button, but the guest entry remains.
    expect(buttons('Sign up')).toHaveLength(0);
    expect(buttons('Create Account')).toHaveLength(0);
    expect(buttons('No account? Browse as guest →')).toHaveLength(1);
});

test('strict servers keep the full-screen login without any guest entry', async () => {
    mocks.authCheck.mockResolvedValue({ auth_required: true, guest_allowed: false, registration_enabled: false });
    await render([plugin('healthy')]);
    expect(node.textContent).toContain('Access Password');
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
    expect(node.querySelectorAll('input[type=text]')).toHaveLength(1);
    expect(buttons('No account? Browse as guest →')).toHaveLength(0);
});

test('signed-in users load their plugin choices from the server', async () => {
    mocks.authCheck.mockResolvedValue({ auth_required: true, authenticated: true, username: 'boss', role: 'admin' });
    mocks.getDisabledPlugins.mockResolvedValue({ disabled_plugins: ['healthy'], stored: true });
    await render([plugin('healthy')]);
    await flush();

    // The account's saved list hides the plugin; the empty state offers the
    // manager to re-enable it.
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
    await clickByText('Plugin Management');
    await click(node.querySelector('button[aria-label="Enable"]'));
    await flush();
    expect(node.textContent).toContain('HEALTHY_CONTENT');
    // Re-enabling saved the new list to the account, not just the browser.
    expect(apiSetDisabledPlugins).toHaveBeenCalledWith([]);
});

test('guests keep plugin choices in the browser only', async () => {
    await render([plugin('healthy')]);
    await clickByText('No account? Browse as guest →');
    await click(node.querySelector('button[aria-label="Plugin Management"]'));
    await click(node.querySelector('button[aria-label="Disable"]'));
    await flush();

    expect(apiSetDisabledPlugins).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('openan-disabled-plugins'))).toEqual(['healthy']);
    // The plugin disappeared from the shell.
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
});
