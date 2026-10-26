// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Global test setup — loaded by vitest.config.js for every test file.
 *
 * - Registers @testing-library/jest-dom matchers (toBeInTheDocument, …)
 * - Cleans up rendered components and localStorage between tests
 * - Resets Portal global state (Module Federation bridge, bundle-loader flags)
 * - Polyfills jsdom-missing browser APIs used by UI libraries
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

// Snapshot of window keys that Portal modules may mutate — restored after
// every test instead of deleted, because vitest's jsdom environment injects
// some Node globals (e.g. `process`) that must survive.
const GLOBAL_KEYS_TO_RESET = [
    '__OPENAN_PORTAL_CONTEXT__',
    '__OPENAN_BUNDLE_GLOBALS_READY__',
    'process',
    'require',
    'React',
    'ReactDOM',
    'ReactI18next',
    'OpenANPortalSDK',
];
const originalGlobals = Object.fromEntries(
    GLOBAL_KEYS_TO_RESET.map((k) => [k, window[k]])
);

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    // Reset side effects that Portal modules write to the window object —
    // otherwise tests leak state (e.g. a stale PortalContext from a previous
    // render makes usePortalContext() succeed when it should throw).
    for (const key of GLOBAL_KEYS_TO_RESET) {
        if (key in originalGlobals && originalGlobals[key] !== undefined) {
            window[key] = originalGlobals[key];
        } else {
            delete window[key];
        }
    }
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    // Remove <script>/<link> elements injected by bundle-loader tests.
    document.head.querySelectorAll('script[src], link[rel="stylesheet"]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
});

beforeAll(() => {
    // jsdom lacks matchMedia — required by framer-motion, recharts, etc.
    if (!window.matchMedia) {
        window.matchMedia = (query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        });
    }
    // jsdom lacks ResizeObserver — required by @xyflow/react, recharts, etc.
    if (!window.ResizeObserver) {
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
    if (!window.IntersectionObserver) {
        window.IntersectionObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() { return []; }
        };
    }
    if (!window.HTMLCanvasElement.prototype.getContext) {
        window.HTMLCanvasElement.prototype.getContext = () => null;
    }
    window.scrollTo = () => {};
    // jsdom lacks Element.prototype.scrollTo — used by auto-scroll effects
    // (e.g. execution-center matching the selected PSOP card into view).
    if (!window.Element.prototype.scrollTo) {
        window.Element.prototype.scrollTo = () => {};
    }
});
