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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../../src/auth/Login.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import { authCheck, login as apiLogin } from '../../src/service/api.js';
import {
    renderWithShellProviders,
    baseI18n,
} from '../../../tests/helpers/portal-test-utils.jsx';

// Only the auth endpoints are mocked; everything else stays real.
vi.mock('../../src/service/api.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        authCheck: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
    };
});

/** Render Login inside the providers it needs (auth/theme/i18n/router). */
async function renderLogin() {
    let utils;
    await act(async () => {
        utils = renderWithShellProviders(
            <AuthProvider>
                <Login />
            </AuthProvider>
        );
    });
    return utils;
}

beforeEach(async () => {
    vi.resetAllMocks();
    // Any auth state works — Login renders unconditionally as a child; this
    // mirrors the unauthenticated branch of PortalShell.
    authCheck.mockResolvedValue({ auth_required: true });
    // Deterministic translated labels.
    await baseI18n.changeLanguage('en');
});

describe('Login', () => {
    it('renders the login card with translated labels', async () => {
        await renderLogin();

        expect(screen.getByText('Access Password')).toBeInTheDocument();
        expect(screen.getByText('Open Autonomous Networks')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Username')
        ).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Enter access password...')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Enter' })
        ).toBeInTheDocument();
    });

    it('submits the typed credentials', async () => {
        apiLogin.mockResolvedValue({ username: 'ops' });
        const user = userEvent.setup();
        await renderLogin();

        await user.type(screen.getByPlaceholderText('Username'), 'ops-user');
        await user.type(
            screen.getByPlaceholderText('Enter access password...'),
            's3cret'
        );
        await user.click(screen.getByRole('button', { name: 'Enter' }));

        expect(apiLogin).toHaveBeenCalledWith('ops-user', 's3cret');
    });

    it('defaults the username to "admin" when left empty', async () => {
        apiLogin.mockResolvedValue({});
        const user = userEvent.setup();
        await renderLogin();

        await user.type(
            screen.getByPlaceholderText('Enter access password...'),
            'pw'
        );
        await user.click(screen.getByRole('button', { name: 'Enter' }));

        expect(apiLogin).toHaveBeenCalledWith('admin', 'pw');
    });

    it('shows the server-provided detail on login failure', async () => {
        apiLogin.mockRejectedValue({
            response: { status: 401, data: { detail: 'Invalid credentials' } },
        });
        const user = userEvent.setup();
        await renderLogin();

        await user.click(screen.getByRole('button', { name: 'Enter' }));

        expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
        // The button is re-enabled after the failure.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled()
        );
    });

    it('falls back to the generic translated error when no detail exists', async () => {
        apiLogin.mockRejectedValue(new Error('network down'));
        const user = userEvent.setup();
        await renderLogin();

        await user.click(screen.getByRole('button', { name: 'Enter' }));

        expect(
            await screen.findByText('Login failed, please check your password')
        ).toBeInTheDocument();
    });

    it('disables the submit button and shows the loading label while logging in', async () => {
        // Never-resolving login keeps the component in the loading state.
        apiLogin.mockImplementation(() => new Promise(() => {}));
        const user = userEvent.setup();
        await renderLogin();

        await user.click(screen.getByRole('button', { name: 'Enter' }));

        const button = screen.getByRole('button', { name: 'Verifying...' });
        expect(button).toBeDisabled();
    });
});
