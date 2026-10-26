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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalApp } from '../src/PortalApp.jsx';
import { authCheck } from '../src/service/api.js';
import { baseI18n } from '../../tests/helpers/portal-test-utils.jsx';

// Only the auth endpoints are mocked; everything else stays real.
vi.mock('../src/service/api.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        authCheck: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
    };
});

/** A valid source-plugin config entry that lazy-renders a view div. */
function makeSourcePluginConfig(id) {
    return {
        id,
        enabled: true,
        manifest: async () => ({
            default: {
                id,
                name: id.toUpperCase(),
                version: '1.0.0',
                menu: [
                    {
                        id: `${id}-menu`,
                        labelKey: id.toUpperCase(),
                        order: 1,
                        route: `/${id}`,
                    },
                ],
                routes: [
                    {
                        path: `/${id}`,
                        menuId: `${id}-menu`,
                        component: async () => ({
                            default: () => <div data-testid={`${id}-view`}>{id}</div>,
                        }),
                    },
                ],
            },
        }),
    };
}

/** Render the whole app and flush the initial auth check + plugin load. */
async function renderApp(pluginsConfig) {
    let utils;
    await act(async () => {
        utils = render(<PortalApp pluginsConfig={pluginsConfig} />);
    });
    return utils;
}

beforeEach(async () => {
    vi.resetAllMocks();
    authCheck.mockResolvedValue({ auth_required: false });
    await baseI18n.changeLanguage('en');
});

afterEach(() => {
    // PortalApp mounts a real BrowserRouter — reset the jsdom URL so the
    // next test starts from "/" again.
    window.history.pushState({}, '', '/');
});

describe('PortalApp (smoke)', () => {
    it('authenticates, loads the plugin and renders its route view', async () => {
        await renderApp({
            plugins: [makeSourcePluginConfig('t')],
        });

        // "/" redirects to the first (and only) plugin route "/t".
        expect(await screen.findByTestId('t-view')).toHaveTextContent('t');
        // The plugin appears in the dynamic navigation.
        expect(screen.getByRole('button', { name: 'T' })).toBeInTheDocument();
        // The Module Federation bridge context is published for plugins.
        expect(window.__OPENAN_PORTAL_CONTEXT__).toBeDefined();
        expect(window.__OPENAN_PORTAL_CONTEXT__.auth.isAuthenticated).toBe(true);
    });

    it('renders the Login screen when authentication is required', async () => {
        authCheck.mockResolvedValue({ auth_required: true });
        await renderApp({
            plugins: [makeSourcePluginConfig('t')],
        });

        expect(await screen.findByText('Access Password')).toBeInTheDocument();
        expect(screen.queryByTestId('t-view')).not.toBeInTheDocument();
    });

    it('falls back to the empty-plugins state when nothing is enabled', async () => {
        await renderApp({ plugins: [] });

        expect(
            await screen.findByText('No plugins enabled. Check plugins.config.js')
        ).toBeInTheDocument();
        // The empty state offers the plugin manager.
        expect(
            screen.getByRole('button', { name: 'Plugin Management' })
        ).toBeInTheDocument();
    });

    it('opens the Plugin Manager from the empty-plugins state (dead-button regression)', async () => {
        // Regression: the empty state's "Plugin Management" button used to
        // only flip state — the modal itself was never rendered in the
        // routes.length === 0 branch.
        const user = userEvent.setup();
        await renderApp({ plugins: [] });

        expect(
            await screen.findByText('No plugins enabled. Check plugins.config.js')
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Plugin Management' }));

        // The plugin manager modal opens (its subtitle is rendered).
        expect(
            await screen.findByText('Enable or disable plugins at runtime')
        ).toBeInTheDocument();
    });

    it('hides plugins disabled via localStorage "openan-disabled-plugins"', async () => {
        window.localStorage.setItem(
            'openan-disabled-plugins',
            JSON.stringify(['t'])
        );
        await renderApp({
            plugins: [makeSourcePluginConfig('t')],
        });

        expect(
            await screen.findByText('No plugins enabled. Check plugins.config.js')
        ).toBeInTheDocument();
        expect(screen.queryByTestId('t-view')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'T' })).not.toBeInTheDocument();
    });

    it('drops the session when the "auth-expired" event fires', async () => {
        await renderApp({
            plugins: [makeSourcePluginConfig('t')],
        });
        expect(await screen.findByTestId('t-view')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(new Event('auth-expired'));
        });

        expect(await screen.findByText('Access Password')).toBeInTheDocument();
    });
});
