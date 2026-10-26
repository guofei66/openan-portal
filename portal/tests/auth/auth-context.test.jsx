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
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.jsx';
import {
    authCheck,
    login as apiLogin,
    logout as apiLogout,
} from '../../src/service/api.js';

// Replace only the auth endpoints of the api module — the rest (default api
// instance, createApi, …) stays real. AuthContext consumes these mocks.
vi.mock('../../src/service/api.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        authCheck: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
    };
});

/** Probe echoing the auth context into the DOM. */
function AuthProbe() {
    const auth = useAuth();
    return (
        <div>
            <span data-testid="state">{auth.authState}</span>
            <span data-testid="user">{String(auth.currentUser)}</span>
            <span data-testid="required">{String(auth.authRequired)}</span>
            <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
            <span data-testid="checking">{String(auth.isChecking)}</span>
            <span data-testid="has-api">{String(typeof auth.api?.get === 'function')}</span>
            {/* .catch() — the context rethrows logout failures after cleanup */}
            <button onClick={() => auth.login('u', 'p').catch(() => {})}>login</button>
            <button onClick={() => auth.logout().catch(() => {})}>logout</button>
            <button onClick={() => auth.checkAuth()}>recheck</button>
        </div>
    );
}

/** Render the probe and flush the initial auth check inside act(). */
async function renderAuth() {
    let utils;
    await act(async () => {
        utils = render(
            <AuthProvider>
                <AuthProbe />
            </AuthProvider>
        );
    });
    return utils;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AuthProvider initial check', () => {
    it('starts in the "checking" state and awaits authCheck', async () => {
        let resolveCheck;
        authCheck.mockImplementation(
            () => new Promise((resolve) => { resolveCheck = resolve; })
        );

        render(
            <AuthProvider>
                <AuthProbe />
            </AuthProvider>
        );

        expect(screen.getByTestId('state')).toHaveTextContent('checking');
        expect(screen.getByTestId('checking')).toHaveTextContent('true');

        await act(async () => {
            resolveCheck({ auth_required: false, username: 'admin' });
        });
        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
    });

    it('auth_required=false authenticates without requiring a user', async () => {
        authCheck.mockResolvedValue({ auth_required: false });
        await renderAuth();

        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('required')).toHaveTextContent('false');
    });

    it('authenticated=true authenticates and keeps authRequired', async () => {
        authCheck.mockResolvedValue({
            auth_required: true,
            authenticated: true,
            username: 'bob',
        });
        await renderAuth();

        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('bob');
        expect(screen.getByTestId('required')).toHaveTextContent('true');
    });

    it('auth_required=true without authentication → unauthenticated', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        await renderAuth();

        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('required')).toHaveTextContent('true');
    });

    it('a failing authCheck falls back to unauthenticated', async () => {
        authCheck.mockRejectedValue(new Error('backend down'));
        await renderAuth();

        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });

    it('exposes the shared api instance on the context', async () => {
        authCheck.mockResolvedValue({ auth_required: false });
        await renderAuth();
        expect(screen.getByTestId('has-api')).toHaveTextContent('true');
    });
});

describe('AuthProvider.login', () => {
    it('calls apiLogin with the credentials and sets the user', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        apiLogin.mockResolvedValue({ username: 'alice' });
        const user = userEvent.setup();
        await renderAuth();

        await user.click(screen.getByRole('button', { name: 'login' }));

        expect(apiLogin).toHaveBeenCalledWith('u', 'p');
        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('alice');
        expect(screen.getByTestId('required')).toHaveTextContent('true');
    });

    it('falls back to the submitted username when the response carries none', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        apiLogin.mockResolvedValue({});
        const user = userEvent.setup();
        await renderAuth();

        await user.click(screen.getByRole('button', { name: 'login' }));

        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('u');
    });

    it('stays unauthenticated when apiLogin rejects', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        apiLogin.mockRejectedValue({ response: { status: 401 } });
        const user = userEvent.setup();
        await renderAuth();

        await user.click(screen.getByRole('button', { name: 'login' }));

        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
});

describe('AuthProvider.logout', () => {
    it('clears the session after a successful apiLogout', async () => {
        authCheck.mockResolvedValue({
            auth_required: true,
            authenticated: true,
            username: 'carol',
        });
        const user = userEvent.setup();
        await renderAuth();
        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');

        await user.click(screen.getByRole('button', { name: 'logout' }));

        expect(apiLogout).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    it('clears the session even when apiLogout rejects', async () => {
        authCheck.mockResolvedValue({
            auth_required: true,
            authenticated: true,
            username: 'carol',
        });
        apiLogout.mockRejectedValue(new Error('logout endpoint down'));
        const user = userEvent.setup();
        await renderAuth();

        await user.click(screen.getByRole('button', { name: 'logout' }));

        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
});

describe('auth-expired event handling', () => {
    it('switches to unauthenticated when the window "auth-expired" event fires', async () => {
        authCheck.mockResolvedValue({
            auth_required: true,
            authenticated: true,
            username: 'dave',
        });
        await renderAuth();
        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');

        act(() => {
            window.dispatchEvent(new Event('auth-expired'));
        });

        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });
});

describe('checkAuth re-runs', () => {
    it('re-evaluates the auth state when called again', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        const user = userEvent.setup();
        await renderAuth();
        expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated');

        // The backend session appears while the page stays open.
        authCheck.mockResolvedValue({ authenticated: true, username: 'late-user' });
        await user.click(screen.getByRole('button', { name: 'recheck' }));

        expect(screen.getByTestId('state')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user')).toHaveTextContent('late-user');
        expect(authCheck).toHaveBeenCalledTimes(2);
    });
});

describe('useAuth', () => {
    it('throws outside an <AuthProvider>', () => {
        // SSR render: throws synchronously without React's guarded-callback
        // machinery (which jsdom reports as "uncaught" noise in DOM tests).
        expect(() => renderToString(<AuthProbe />)).toThrow(
            /useAuth\(\) must be used within an <AuthProvider>/
        );
    });
});
