// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared test helpers for Portal / plugin tests.
 *
 * Usage patterns:
 *
 *   import { describe, it, expect, vi } from 'vitest';
 *   import { renderWithPortalContext, createMockPortalValue } from '../../../tests/helpers/portal-test-utils.jsx';
 *
 *   renderWithPortalContext(<MyPlugin />, { value: createMockPortalValue() });
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import { PortalProvider } from '@openan/portal-sdk';
import baseI18n from '../../portal/src/i18n/index.js';
import { ThemeProvider } from '../../portal/src/theme/ThemeContext.jsx';

/**
 * The Portal's base i18n singleton (initialized with base-en/base-zh).
 * Importing it here initializes react-i18next for any component under test.
 */
export { baseI18n };

/**
 * Axios-like mock for the shared `api` instance exposed via PortalContext.
 * Every method is a vi.fn() resolving to `{ data: … }`-unwrapped payloads
 * (the real axios interceptor returns response.data, so plugin code expects
 * the payload directly).
 */
export function createMockApi(overrides = {}) {
    const ok = (data = {}) => Promise.resolve(data);
    return {
        get: vi.fn((url) => ok({ url })),
        post: vi.fn((url) => ok({ url })),
        put: vi.fn((url) => ok({ url })),
        delete: vi.fn((url) => ok({ url })),
        interceptors: { response: { use: vi.fn() } },
        ...overrides,
    };
}

/**
 * Build a PortalContext value for PortalProvider-wrapped renders.
 * Mirrors the shape documented in packages/portal-sdk/src/plugin-context.jsx.
 */
export function createMockPortalValue(overrides = {}) {
    return {
        api: createMockApi(),
        auth: {
            user: 'admin',
            role: 'admin',
            isAuthenticated: true,
            login: vi.fn(async () => ({})),
            logout: vi.fn(async () => {}),
            check: vi.fn(async () => ({ auth_required: false })),
        },
        theme: {
            isDark: true,
            toggle: vi.fn(),
            setDark: vi.fn(),
        },
        i18n: baseI18n,
        navigate: vi.fn(),
        router: { location: { pathname: '/' }, params: {} },
        registerMenu: vi.fn(),
        registerRoute: vi.fn(),
        ...overrides,
    };
}

/**
 * Render a plugin component inside a PortalProvider (MockPortal-equivalent,
 * but with controllable context values) + MemoryRouter + base i18n.
 */
export function renderWithPortalContext(ui, { value = createMockPortalValue(), route = '/' } = {}) {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <I18nextProvider i18n={baseI18n}>
                <PortalProvider value={value}>
                    {ui}
                </PortalProvider>
            </I18nextProvider>
        </MemoryRouter>
    );
}

/**
 * Render a Portal shell component with the providers it needs
 * (ThemeProvider + base i18n + MemoryRouter). Auth is NOT provided —
 * components requiring useAuth() must be wrapped in an AuthProvider by
 * the test (see auth tests for the vi.mock pattern).
 */
export function renderWithShellProviders(ui, { route = '/' } = {}) {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <I18nextProvider i18n={baseI18n}>
                <ThemeProvider>
                    {ui}
                </ThemeProvider>
            </I18nextProvider>
        </MemoryRouter>
    );
}
