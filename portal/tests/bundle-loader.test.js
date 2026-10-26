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

/**
 * Tests for the plugin bundle loader (governance core).
 *
 * The loader keeps module-level state (loadedScripts/loadedStyles) and jsdom
 * does not execute external <script src> resources, so every test:
 *   - re-imports the module fresh (vi.resetModules + dynamic import),
 *   - stubs global fetch with a controllable mock,
 *   - spies document.createElement so <script> injection "loads" via a
 *     microtask that fires onload/onerror after the caller assigns them.
 * Retry backoff (800ms sleeps) is skipped with fake timers.
 */

let loadPluginBundle;
let fetchMock;
/** Number of upcoming script injections to fail before succeeding again. */
let scriptFailuresRemaining = 0;

const origCreateElement = document.createElement.bind(document);

/** Fresh manifest fixture — each fetch returns its own instance. */
function makeManifest(overrides = {}) {
    return {
        id: 'demo-showcase',
        name: 'Demo Showcase',
        version: '1.0.0',
        entry: 'index.js',
        css: 'index.css',
        menu: [
            {
                id: 'm',
                labelKey: 'demo-showcase:demo.title',
                order: 5,
                route: '/demo',
            },
        ],
        routes: [
            {
                path: '/demo',
                menuId: 'm',
                component: async () => ({ default: () => null }),
            },
        ],
        ...overrides,
    };
}

/** Simulate the UMD bundle assigning its component to the expected global. */
function setBundleGlobal(id, bundle) {
    window[`__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`] = bundle;
}

function headScriptSrcs() {
    return [...document.head.querySelectorAll('script[src]')].map((s) =>
        s.getAttribute('src')
    );
}

function headStyleHrefs() {
    return [...document.head.querySelectorAll('link[rel="stylesheet"]')].map((l) =>
        l.getAttribute('href')
    );
}

beforeEach(async () => {
    vi.resetModules();
    scriptFailuresRemaining = 0;

    // Fetch mock — individual tests override the responses.
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => makeManifest() }));
    vi.stubGlobal('fetch', fetchMock);

    // Script-injection mock: jsdom never loads external scripts, so setting
    // `src` schedules onload/onerror on a microtask — after the loader has
    // attached its handlers synchronously.
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
        const el = origCreateElement(tag, options);
        if (tag === 'script') {
            let src = '';
            Object.defineProperty(el, 'src', {
                configurable: true,
                get: () => src,
                set: (value) => {
                    src = String(value);
                    el.setAttribute('src', src);
                    queueMicrotask(() => {
                        if (scriptFailuresRemaining > 0) {
                            scriptFailuresRemaining -= 1;
                            if (el.onerror) el.onerror(new Error(`script failed: ${src}`));
                        } else if (el.onload) {
                            el.onload();
                        }
                    });
                },
            });
        }
        return el;
    });

    ({ loadPluginBundle } = await import('../src/bundle-loader.js'));
});

afterEach(() => {
    vi.restoreAllMocks(); // restores the createElement spy
    // Remove injected script/link elements and any __OPENAN_PLUGIN__ globals
    // (setup.js only resets a fixed key list).
    document.head.querySelectorAll('script, link').forEach((el) => el.remove());
    Object.keys(window)
        .filter((k) => k.startsWith('__OPENAN_PLUGIN__'))
        .forEach((k) => delete window[k]);
    scriptFailuresRemaining = 0;
});

describe('loadPluginBundle — local happy path', () => {
    it('loads manifest, injects css + script, reads the global and wraps routes', async () => {
        const PluginView = () => null;
        setBundleGlobal('demo-showcase', { default: PluginView });

        const manifest = await loadPluginBundle({
            id: 'demo-showcase',
            entry: '/plugins/demo',
        });

        // Manifest fetched once, with no-store caching.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            '/plugins/demo/plugin.manifest.json',
            { cache: 'no-store' }
        );
        // Stylesheet linked from base + manifest.css.
        expect(headStyleHrefs()).toEqual(['/plugins/demo/index.css']);
        // Script injected at base + manifest.entry.
        expect(headScriptSrcs()).toEqual(['/plugins/demo/index.js']);
        // Load mode and resolved base URL are recorded on the manifest.
        expect(manifest._loadMode).toBe('local');
        expect(manifest._baseUrl).toBe('/plugins/demo');
        // Routes are wrapped: component() resolves { default: Component }.
        expect(typeof manifest.routes[0].component).toBe('function');
        const mod = await manifest.routes[0].component();
        expect(mod.default).toBe(PluginView);
    });

    it('defaults the entry to index.js and honors a custom entry', async () => {
        const PluginView = () => null;

        // No entry declared → index.js.
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () => makeManifest({ entry: undefined }),
        }));
        setBundleGlobal('demo-showcase', { default: PluginView });
        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' });
        expect(headScriptSrcs()).toEqual(['/plugins/demo/index.js']);

        // Custom entry → base + custom file.
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () => makeManifest({ entry: 'main.js' }),
        }));
        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo2' });
        expect(headScriptSrcs()).toEqual([
            '/plugins/demo/index.js',
            '/plugins/demo2/main.js',
        ]);
    });

    it('injects each script/style only once for the same entry', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });

        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' });
        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' });

        expect(
            document.head.querySelectorAll('script[src="/plugins/demo/index.js"]')
        ).toHaveLength(1);
        expect(headStyleHrefs()).toEqual(['/plugins/demo/index.css']);
    });
});

describe('loadPluginBundle — bundle contract violations', () => {
    it('throws a descriptive error when the bundle global is not set', async () => {
        // NOTE: no window.__OPENAN_PLUGIN__demo_showcase assigned.
        await expect(
            loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' })
        ).rejects.toThrow(
            'Plugin "demo-showcase" bundle loaded but window.__OPENAN_PLUGIN__demo_showcase is not set'
        );
    });

    it('throws when the bundle default export is not a component', async () => {
        setBundleGlobal('demo-showcase', { default: 'not-a-component' });
        await expect(
            loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' })
        ).rejects.toThrow('did not export a component');
    });

    it('throws when the global itself is not a component', async () => {
        setBundleGlobal('demo-showcase', 42);
        await expect(
            loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' })
        ).rejects.toThrow('did not export a component');
    });
});

describe('loadPluginBundle — fetch retries', () => {
    it('rejects after two failed fetch attempts (HTTP error)', async () => {
        fetchMock.mockImplementation(async () => ({ ok: false, status: 503 }));
        vi.useFakeTimers();
        try {
            const promise = loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            // Attach the rejection handler BEFORE advancing timers, so the
            // rejection is never reported as unhandled.
            const rejection = expect(promise).rejects.toThrow(
                'Failed to fetch /plugins/demo/plugin.manifest.json: 503'
            );
            // Skip the 800ms backoff between the two attempts.
            await vi.advanceTimersByTimeAsync(800);
            await rejection;
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects after two fetch attempts that throw (network error)', async () => {
        fetchMock.mockImplementation(async () => {
            throw new Error('connection refused');
        });
        vi.useFakeTimers();
        try {
            const promise = loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            const rejection = expect(promise).rejects.toThrow('connection refused');
            await vi.advanceTimersByTimeAsync(800);
            await rejection;
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('succeeds when only the first fetch attempt fails', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });
        fetchMock
            .mockImplementationOnce(async () => ({ ok: false, status: 500 }))
            .mockImplementationOnce(async () => ({
                ok: true,
                json: async () => makeManifest(),
            }));
        vi.useFakeTimers();
        try {
            const promise = loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            await vi.advanceTimersByTimeAsync(800);
            const manifest = await promise;
            expect(manifest._loadMode).toBe('local');
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('loadPluginBundle — script injection retries', () => {
    it('retries once when the script fails to load and succeeds on the second try', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });
        scriptFailuresRemaining = 1;
        vi.useFakeTimers();
        try {
            const promise = loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            await vi.advanceTimersByTimeAsync(800);
            const manifest = await promise;
            expect(manifest._loadMode).toBe('local');
            // Both attempts appended a <script> tag to the head.
            expect(
                document.head.querySelectorAll('script[src="/plugins/demo/index.js"]')
            ).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects when the script fails on both attempts', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });
        scriptFailuresRemaining = 2;
        vi.useFakeTimers();
        try {
            const promise = loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            const rejection = expect(promise).rejects.toThrow(
                'Failed to load script: /plugins/demo/index.js'
            );
            await vi.advanceTimersByTimeAsync(800);
            await rejection;
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('loadPluginBundle — remote mode and URL normalization', () => {
    it('marks http(s) entries as remote and normalizes trailing slashes', async () => {
        setBundleGlobal('remote-plugin', { default: () => null });
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () => makeManifest({ id: 'remote-plugin' }),
        }));

        const manifest = await loadPluginBundle({
            id: 'remote-plugin',
            entry: 'http://localhost:7777/plugins/x/',
        });

        expect(manifest._loadMode).toBe('remote');
        expect(manifest._baseUrl).toBe('http://localhost:7777/plugins/x');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:7777/plugins/x/plugin.manifest.json',
            { cache: 'no-store' }
        );
        expect(headScriptSrcs()).toEqual([
            'http://localhost:7777/plugins/x/index.js',
        ]);
    });

    it('normalizes trailing slashes on local entries (no double slash)', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });
        const manifest = await loadPluginBundle({
            id: 'demo-showcase',
            entry: '/plugins/demo/',
        });

        expect(manifest._baseUrl).toBe('/plugins/demo');
        expect(fetchMock).toHaveBeenCalledWith(
            '/plugins/demo/plugin.manifest.json',
            { cache: 'no-store' }
        );
        expect(headScriptSrcs()).toEqual(['/plugins/demo/index.js']);
    });
});

describe('loadPluginBundle — i18n label fallback', () => {
    it('rewrites namespace-style labelKeys to the plugin name, keeps plain labels', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () =>
                makeManifest({
                    menu: [
                        {
                            id: 'a',
                            labelKey: 'demo-showcase:demo.title',
                            order: 1,
                            route: '/demo',
                        },
                        {
                            id: 'b',
                            labelKey: 'Ontology T-Box',
                            order: 2,
                            route: '/tbox',
                        },
                        {
                            id: 'c',
                            labelKey: 'demo-showcase:other',
                            group: 'demo-showcase:group.key',
                            order: 3,
                            route: '/c',
                        },
                    ],
                }),
        }));

        const manifest = await loadPluginBundle({
            id: 'demo-showcase',
            entry: '/plugins/demo',
        });

        expect(manifest.menu[0].labelKey).toBe('Demo Showcase');
        expect(manifest.menu[1].labelKey).toBe('Ontology T-Box');
        expect(manifest.menu[2].labelKey).toBe('Demo Showcase');
        // Group labels are not rewritten.
        expect(manifest.menu[2].group).toBe('demo-showcase:group.key');
    });

    it('registers zh translations for known plugin display names', async () => {
        setBundleGlobal('registry-center', { default: () => null });
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () =>
                makeManifest({
                    id: 'registry-center',
                    name: 'Registry Center',
                    menu: [
                        {
                            id: 'rc',
                            labelKey: 'registry-center:registry.title',
                            order: 1,
                            route: '/rc',
                        },
                    ],
                }),
        }));

        const manifest = await loadPluginBundle({
            id: 'registry-center',
            entry: '/plugins/rc',
        });
        expect(manifest.menu[0].labelKey).toBe('Registry Center');

        // Same i18n singleton the loader used within this module cycle.
        const i18n = (await import('../src/i18n/index.js')).default;
        expect(i18n.exists('Registry Center')).toBe(true);
        await i18n.changeLanguage('zh');
        expect(i18n.t('Registry Center')).toBe('注册中心');
        await i18n.changeLanguage('en');
        expect(i18n.t('Registry Center')).toBe('Registry Center');
    });

    it('falls back to the label itself for unknown plugin names in zh', async () => {
        setBundleGlobal('ut-plugin', { default: () => null });
        fetchMock.mockImplementation(async () => ({
            ok: true,
            json: async () =>
                makeManifest({
                    id: 'ut-plugin',
                    name: 'UT Custom Plugin',
                    menu: [
                        {
                            id: 'u',
                            labelKey: 'ut-plugin:nav.title',
                            order: 1,
                            route: '/u',
                        },
                    ],
                }),
        }));

        const manifest = await loadPluginBundle({
            id: 'ut-plugin',
            entry: '/plugins/ut',
        });
        expect(manifest.menu[0].labelKey).toBe('UT Custom Plugin');

        const i18n = (await import('../src/i18n/index.js')).default;
        await i18n.changeLanguage('zh');
        expect(i18n.t('UT Custom Plugin')).toBe('UT Custom Plugin');
    });
});

describe('ensureRuntimeGlobals', () => {
    it('exposes React/ReactDOM/ReactI18next/PortalSDK globals and a require shim', async () => {
        setBundleGlobal('demo-showcase', { default: () => null });

        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' });

        expect(window.__OPENAN_BUNDLE_GLOBALS_READY__).toBe(true);
        expect(window.React).toBeDefined();
        expect(window.ReactDOM).toBeDefined();
        expect(window.ReactI18next).toBeDefined();
        expect(window.OpenANPortalSDK).toBeDefined();

        // CJS require shim — named exports AND .default interop both resolve.
        const reactCjs = window.require('react');
        expect(typeof reactCjs.useState).toBe('function');
        expect(typeof reactCjs.default.useState).toBe('function');
        expect(typeof window.require('react-dom').createRoot).toBe('function');
        expect(
            typeof window.require('react-i18next').useTranslation
        ).toBe('function');
        expect(
            typeof window.require('@openan/portal-sdk').usePortalContext
        ).toBe('function');
        // Unknown modules throw a descriptive error.
        expect(() => window.require('does-not-exist')).toThrow(
            'require("does-not-exist") is not available in the browser'
        );
    });

    it('installs a browser-safe process stub when window.process is missing', async () => {
        // Whether Node's process leaks onto the jsdom window depends on the
        // runner — force the clean-browser case the loader is designed for.
        const hadProcess = 'process' in window;
        const originalProcess = window.process;
        delete window.process;
        try {
            setBundleGlobal('demo-showcase', { default: () => null });
            await loadPluginBundle({
                id: 'demo-showcase',
                entry: '/plugins/demo',
            });
            expect(window.process).toEqual({
                env: { NODE_ENV: 'production' },
                browser: true,
            });
        } finally {
            if (hadProcess) window.process = originalProcess;
        }
    });

    it('skips re-initialization when __OPENAN_BUNDLE_GLOBALS_READY__ is already set', async () => {
        window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
        window.React = 'sentinel';
        setBundleGlobal('demo-showcase', { default: () => null });

        await loadPluginBundle({ id: 'demo-showcase', entry: '/plugins/demo' });

        // The early return left the pre-existing global untouched.
        expect(window.React).toBe('sentinel');
    });
});
