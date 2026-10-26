// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
    PortalContext,
    PortalProvider,
    usePortalContext,
} from '../src/plugin-context.jsx';
import { createMockPortalValue } from '../../../tests/helpers/portal-test-utils.jsx';

/** Consumer component that echoes the context into the DOM. */
function ContextProbe() {
    const ctx = usePortalContext();
    return <div data-testid="probe">{ctx?.auth?.user ?? 'no-user'}</div>;
}

describe('usePortalContext', () => {
    it('returns the provider value inside <PortalProvider>', () => {
        const value = createMockPortalValue({ auth: { ...createMockPortalValue().auth, user: 'alice' } });
        render(
            <PortalProvider value={value}>
                <ContextProbe />
            </PortalProvider>
        );
        expect(screen.getByTestId('probe')).toHaveTextContent('alice');
    });

    it('throws outside a provider when no global bridge is set', () => {
        // Render via SSR: the hook only uses useContext, and renderToString
        // throws synchronously without React's guarded-callback machinery
        // (which jsdom reports as "uncaught" noise in DOM tests).
        // The afterEach hook in setup.js guarantees no leftover global.
        expect(() => renderToString(<ContextProbe />)).toThrow(
            /usePortalContext\(\) must be used within a <PortalProvider>/
        );
    });

    it('falls back to window.__OPENAN_PORTAL_CONTEXT__ (Module Federation bridge)', () => {
        // A plugin built with its own copy of portal-sdk has a different
        // React Context instance — the bridge global is its only path in.
        window.__OPENAN_PORTAL_CONTEXT__ = createMockPortalValue({
            auth: { ...createMockPortalValue().auth, user: 'bridged-user' },
        });
        render(<ContextProbe />);
        expect(screen.getByTestId('probe')).toHaveTextContent('bridged-user');
    });

    it('prefers the React Context over the bridge global', () => {
        window.__OPENAN_PORTAL_CONTEXT__ = createMockPortalValue({
            auth: { ...createMockPortalValue().auth, user: 'from-global' },
        });
        render(
            <PortalProvider value={createMockPortalValue({ auth: { ...createMockPortalValue().auth, user: 'from-react' } })}>
                <ContextProbe />
            </PortalProvider>
        );
        expect(screen.getByTestId('probe')).toHaveTextContent('from-react');
    });
});

describe('PortalProvider', () => {
    it('publishes the context value to window.__OPENAN_PORTAL_CONTEXT__', () => {
        const value = createMockPortalValue();
        render(
            <PortalProvider value={value}>
                <div>child</div>
            </PortalProvider>
        );
        expect(window.__OPENAN_PORTAL_CONTEXT__).toBe(value);
    });

    it('exposes the raw PortalContext for advanced consumers', () => {
        // The Portal shell itself consumes the context object directly.
        // (React 18 context providers are objects with $$typeof, not fns.)
        expect(PortalContext).toBeDefined();
        expect(PortalContext.Provider).toBeDefined();
        expect(PortalContext.Consumer).toBeDefined();
        expect(PortalContext.Provider.$$typeof).toBeDefined();
        expect(PortalContext.Consumer.$$typeof).toBeDefined();
    });
});
