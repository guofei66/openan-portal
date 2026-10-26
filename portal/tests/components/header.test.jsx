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
import { screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import Header from '../../src/components/header/index.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import { authCheck, logout as apiLogout } from '../../src/service/api.js';
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

/** Echoes the router location into the DOM to assert navigation. */
function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

/** Minimal manifest-shaped plugin for the Header's `plugins` prop. */
function makePlugin(id, menu) {
    return { id, name: id, version: '1.0.0', menu, routes: [] };
}

function menuItem(overrides = {}) {
    return {
        id: 'm',
        labelKey: 'Label',
        icon: () => null,
        order: 1,
        route: '/x',
        ...overrides,
    };
}

/** Render Header with the full provider stack and a flushed auth check. */
async function renderHeader(
    { plugins = [], disabledIds = new Set(), route = '/' } = {}
) {
    let utils;
    await act(async () => {
        utils = renderWithShellProviders(
            <AuthProvider>
                <Header plugins={plugins} disabledIds={disabledIds} />
                <LocationProbe />
            </AuthProvider>,
            { route }
        );
    });
    return utils;
}

/** Nav-area buttons whose labels are in `labels`, in DOM order. */
function navButtonsInOrder(labels) {
    return screen
        .getAllByRole('button')
        .filter((b) => labels.includes(b.textContent));
}

beforeEach(async () => {
    vi.resetAllMocks();
    // Authenticated session with auth required → user chip + logout visible.
    authCheck.mockResolvedValue({
        auth_required: true,
        authenticated: true,
        username: 'tester',
    });
    await baseI18n.changeLanguage('en');
});

describe('Header brand', () => {
    it('renders the OpenAN brand and subtitle', async () => {
        await renderHeader();
        // The brand is split across two elements (Open<span>AN</span>) —
        // assert via the subtitle's sibling to get the combined text.
        const subtitle = screen.getByText('Open Autonomous Networks');
        expect(subtitle.previousElementSibling).toHaveTextContent('OpenAN');
    });
});

describe('Header dynamic navigation', () => {
    it('renders flat menu items from all plugins sorted by order', async () => {
        await renderHeader({
            plugins: [
                makePlugin('alpha', [menuItem({ id: 'a', labelKey: 'Alpha', order: 2, route: '/a' })]),
                makePlugin('beta', [menuItem({ id: 'b', labelKey: 'Beta', order: 1, route: '/b' })]),
            ],
        });

        const buttons = navButtonsInOrder(['Alpha', 'Beta']);
        expect(buttons.map((b) => b.textContent)).toEqual(['Beta', 'Alpha']);
    });

    it('hides the nav items of plugins listed in disabledIds', async () => {
        await renderHeader({
            plugins: [
                makePlugin('alpha', [menuItem({ id: 'a', labelKey: 'Alpha', route: '/a' })]),
                makePlugin('beta', [menuItem({ id: 'b', labelKey: 'Beta', route: '/b' })]),
            ],
            disabledIds: new Set(['alpha']),
        });

        expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
    });

    it('navigates to the route when a flat nav button is clicked', async () => {
        const user = userEvent.setup();
        await renderHeader({
            plugins: [makePlugin('alpha', [menuItem({ id: 'a', labelKey: 'Alpha', route: '/a' })])],
        });

        await user.click(screen.getByRole('button', { name: 'Alpha' }));

        expect(screen.getByTestId('location')).toHaveTextContent('/a');
    });

    it('highlights the active nav item by pathname prefix', async () => {
        await renderHeader({
            route: '/b/deeper/page',
            plugins: [
                makePlugin('alpha', [menuItem({ id: 'a', labelKey: 'Alpha', order: 1, route: '/a' })]),
                makePlugin('beta', [menuItem({ id: 'b', labelKey: 'Beta', order: 2, route: '/b' })]),
            ],
        });

        const alpha = screen.getByRole('button', { name: 'Alpha' });
        const beta = screen.getByRole('button', { name: 'Beta' });
        expect(beta.className).toContain('shadow-md');
        expect(alpha.className).not.toContain('shadow-md');
    });
});

describe('Header grouped navigation', () => {
    function ontologyPlugin() {
        return makePlugin('ontology', [
            menuItem({ id: 'tbox', labelKey: 'T-Box', group: 'Ontology', order: 1, route: '/tbox' }),
            menuItem({ id: 'abox', labelKey: 'A-Box', group: 'Ontology', order: 2, route: '/abox' }),
        ]);
    }

    it('collapses grouped items behind a parent button with a dropdown', async () => {
        const user = userEvent.setup();
        await renderHeader({ plugins: [ontologyPlugin()] });

        // Parent button exists; children are hidden until it is clicked.
        const parent = screen.getByRole('button', { name: 'Ontology' });
        expect(screen.queryByRole('button', { name: 'T-Box' })).not.toBeInTheDocument();

        await user.click(parent);
        expect(screen.getByRole('button', { name: 'T-Box' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'A-Box' })).toBeInTheDocument();
    });

    it('clicking a dropdown child navigates and closes the dropdown', async () => {
        const user = userEvent.setup();
        await renderHeader({ plugins: [ontologyPlugin()] });

        await user.click(screen.getByRole('button', { name: 'Ontology' }));
        await user.click(screen.getByRole('button', { name: 'A-Box' }));

        expect(screen.getByTestId('location')).toHaveTextContent('/abox');
        expect(screen.queryByRole('button', { name: 'T-Box' })).not.toBeInTheDocument();
    });

    it('closes the dropdown on mousedown outside the group', async () => {
        const user = userEvent.setup();
        await renderHeader({ plugins: [ontologyPlugin()] });

        await user.click(screen.getByRole('button', { name: 'Ontology' }));
        expect(screen.getByRole('button', { name: 'T-Box' })).toBeInTheDocument();

        act(() => {
            fireEvent.mouseDown(document.body);
        });
        expect(screen.queryByRole('button', { name: 'T-Box' })).not.toBeInTheDocument();
    });

    it('highlights the parent button when a grouped child route is active', async () => {
        await renderHeader({ route: '/tbox', plugins: [ontologyPlugin()] });

        const parent = screen.getByRole('button', { name: 'Ontology' });
        expect(parent.className).toContain('shadow-md');
    });

    it('interleaves flat items and groups by their order', async () => {
        await renderHeader({
            plugins: [
                makePlugin('late-flat', [menuItem({ id: 'lf', labelKey: 'LateFlat', order: 3, route: '/lf' })]),
                ontologyPlugin(), // group position = first child order (1)
                makePlugin('early-flat', [menuItem({ id: 'ef', labelKey: 'EarlyFlat', order: 2, route: '/ef' })]),
            ],
        });

        const buttons = navButtonsInOrder(['Ontology', 'EarlyFlat', 'LateFlat']);
        expect(buttons.map((b) => b.textContent)).toEqual([
            'Ontology',
            'EarlyFlat',
            'LateFlat',
        ]);
    });
});

describe('Header right controls', () => {
    it('shows the current user and logs out when auth is required', async () => {
        const user = userEvent.setup();
        await renderHeader();

        expect(screen.getByText('tester')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Logout' }));

        expect(apiLogout).toHaveBeenCalledTimes(1);
    });

    it('hides the user chip and logout button when auth is not required', async () => {
        authCheck.mockResolvedValue({ auth_required: false });
        await renderHeader();

        expect(screen.queryByText('tester')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    });

    it('toggles the theme via the icon button', async () => {
        const user = userEvent.setup();
        await renderHeader();

        // Default is dark → <html> carries the dark class.
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        // The theme toggle is the only button without an accessible name.
        await user.click(screen.getByRole('button', { name: '' }));

        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('switches language to zh and persists it in localStorage', async () => {
        await renderHeader();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: '中' }));
        });

        expect(baseI18n.language).toBe('zh');
        expect(window.localStorage.getItem('lang')).toBe('zh');
        expect(screen.getByText('开放自治网络')).toBeInTheDocument();
    });

    it('switches back to en and persists it in localStorage', async () => {
        await renderHeader();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: '中' }));
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'EN' }));
        });

        expect(baseI18n.language).toBe('en');
        expect(window.localStorage.getItem('lang')).toBe('en');
        expect(screen.getByText('Open Autonomous Networks')).toBeInTheDocument();
    });
});
