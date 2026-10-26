// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockPortal } from '../src/standalone.jsx';
import { usePortalContext } from '../src/plugin-context.jsx';
import { baseI18n } from '../../../tests/helpers/portal-test-utils.jsx';

/** Probe rendering the values MockPortal provides. */
function Probe() {
    const { auth, theme, api, i18n, navigate, router, registerMenu, registerRoute } = usePortalContext();
    return (
        <div>
            <span data-testid="user">{auth.user}</span>
            <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
            <span data-testid="dark">{String(theme.isDark)}</span>
            <span data-testid="has-api">{String(typeof api.get === 'function')}</span>
            <span data-testid="i18n-lang">{i18n.language}</span>
            <span data-testid="navigate">{String(typeof navigate === 'function')}</span>
            <span data-testid="router-path">{router.location.pathname}</span>
            <span data-testid="register">{String(typeof registerMenu === 'function' && typeof registerRoute === 'function')}</span>
        </div>
    );
}

describe('MockPortal (standalone mode)', () => {
    it('provides a complete PortalContext for plugin development', () => {
        render(
            <MockPortal>
                <Probe />
            </MockPortal>
        );
        expect(screen.getByTestId('user')).toHaveTextContent('admin');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('has-api')).toHaveTextContent('true');
        expect(screen.getByTestId('navigate')).toHaveTextContent('true');
        expect(screen.getByTestId('router-path')).toHaveTextContent('/');
        expect(screen.getByTestId('register')).toHaveTextContent('true');
    });

    it('defaults to dark theme and applies the dark class to <html>', () => {
        render(
            <MockPortal>
                <Probe />
            </MockPortal>
        );
        expect(screen.getByTestId('dark')).toHaveTextContent('true');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('toggles to light theme and updates <html> class + colorScheme', async () => {
        const user = userEvent.setup();
        function ThemeToggleProbe() {
            const { theme } = usePortalContext();
            return <button onClick={theme.toggle}>toggle</button>;
        }
        render(
            <MockPortal>
                <ThemeToggleProbe />
            </MockPortal>
        );
        await user.click(screen.getByRole('button', { name: 'toggle' }));
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('publishes the context to window.__OPENAN_PORTAL_CONTEXT__ for bridged plugins', () => {
        render(
            <MockPortal>
                <Probe />
            </MockPortal>
        );
        expect(window.__OPENAN_PORTAL_CONTEXT__).toBeDefined();
        expect(window.__OPENAN_PORTAL_CONTEXT__.auth.user).toBe('admin');
    });

    it('mock api is a same-origin axios instance with unwrapping interceptor config', () => {
        function ApiProbe() {
            const { api } = usePortalContext();
            return (
                <div>
                    <span data-testid="base-url">{api.defaults.baseURL}</span>
                    <span data-testid="timeout">{String(api.defaults.timeout)}</span>
                    <span data-testid="with-credentials">{String(api.defaults.withCredentials)}</span>
                    <span data-testid="interceptors">{String(api.interceptors.response.handlers.length > 0)}</span>
                </div>
            );
        }
        render(
            <MockPortal>
                <ApiProbe />
            </MockPortal>
        );
        // Standalone mode proxies plugin API paths same-origin — the baseURL
        // must stay EMPTY (not the Portal's '/api/orchestrate' gateway).
        expect(screen.getByTestId('base-url')).toHaveTextContent('');
        expect(screen.getByTestId('timeout')).toHaveTextContent('120000');
        expect(screen.getByTestId('with-credentials')).toHaveTextContent('true');
        // One response interceptor is registered (unwraps response.data).
        expect(screen.getByTestId('interceptors')).toHaveTextContent('true');
    });

    it('loads with the shared base i18n helpers without conflict', () => {
        // Plugins in standalone mode use their own i18n; MockPortal provides
        // a passthrough t(). Ensure importing the portal base i18n singleton
        // (used by helpers) does not break standalone rendering.
        expect(baseI18n).toBeDefined();
        expect(baseI18n.hasResourceBundle('en', 'translation')).toBe(true);
        expect(baseI18n.hasResourceBundle('zh', 'translation')).toBe(true);
        expect(() => render(
            <MockPortal>
                <Probe />
            </MockPortal>
        )).not.toThrow();
    });
});
