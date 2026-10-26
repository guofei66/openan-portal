// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { loadEnabledPlugins } from '../src/config-loader.js';

function makeManifest(overrides = {}) {
    return {
        id: 'p',
        name: 'P',
        version: '1.0.0',
        routes: [{ path: '/p', component: () => Promise.resolve({ default: () => null }), menuId: 'm' }],
        ...overrides,
    };
}

function makeEntry(id, { enabled = true, manifest, mod } = {}) {
    return {
        id,
        enabled,
        manifest: manifest ?? vi.fn(async () => (mod ?? { default: makeManifest({ id }) })),
    };
}

describe('loadEnabledPlugins', () => {
    it('returns [] for null/undefined config', async () => {
        expect(await loadEnabledPlugins(null)).toEqual([]);
        expect(await loadEnabledPlugins(undefined)).toEqual([]);
    });

    it('returns [] when config.plugins is not an array', async () => {
        expect(await loadEnabledPlugins({ plugins: 'nope' })).toEqual([]);
        expect(await loadEnabledPlugins({})).toEqual([]);
    });

    it('returns [] when no plugins are enabled', async () => {
        const manifest = vi.fn();
        const result = await loadEnabledPlugins({
            plugins: [makeEntry('a', { enabled: false, manifest })],
        });
        expect(result).toEqual([]);
        expect(manifest).not.toHaveBeenCalled();
    });

    it('never imports disabled plugin manifests (tree-shake parity)', async () => {
        const disabledLoader = vi.fn();
        await loadEnabledPlugins({
            plugins: [
                makeEntry('disabled', { enabled: false, manifest: disabledLoader }),
                makeEntry('enabled'),
            ],
        });
        expect(disabledLoader).not.toHaveBeenCalled();
    });

    it('throws a descriptive error when an enabled entry has no manifest loader', async () => {
        await expect(loadEnabledPlugins({
            plugins: [{ id: 'broken', enabled: true }],
        })).rejects.toThrow('Plugin "broken" has no manifest loader');
    });

    it('loads, validates and returns enabled manifests', async () => {
        const result = await loadEnabledPlugins({
            plugins: [
                makeEntry('a'),
                makeEntry('b', { enabled: false }),
            ],
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a');
    });

    it('accepts modules that export the manifest directly (no default)', async () => {
        const mod = makeManifest({ id: 'no-default' });
        const result = await loadEnabledPlugins({
            plugins: [makeEntry('no-default', { mod })],
        });
        expect(result[0].id).toBe('no-default');
    });

    it('rejects configs whose manifest fails validation', async () => {
        const bad = makeManifest({ id: 'bad', version: '' });
        await expect(loadEnabledPlugins({
            plugins: [makeEntry('bad', { mod: bad })],
        })).rejects.toThrow('Invalid plugin manifest "bad"');
    });

    it('sorts manifests by the first menu item order', async () => {
        const late = makeManifest({ id: 'late', menu: [{ id: 'm', order: 9, route: '/late' }] });
        const early = makeManifest({ id: 'early', menu: [{ id: 'm', order: 1, route: '/early' }] });
        const none = makeManifest({ id: 'none' });

        const result = await loadEnabledPlugins({
            plugins: [makeEntry('late', { mod: late }), makeEntry('none', { mod: none }), makeEntry('early', { mod: early })],
        });
        expect(result.map((m) => m.id)).toEqual(['early', 'late', 'none']);
    });

    it('treats plugins without menu as last (order 999)', async () => {
        const withMenu = makeManifest({ id: 'with-menu', menu: [{ id: 'm', order: 50, route: '/x' }] });
        const noMenu = makeManifest({ id: 'no-menu' });
        const result = await loadEnabledPlugins({
            plugins: [makeEntry('no-menu', { mod: noMenu }), makeEntry('with-menu', { mod: withMenu })],
        });
        expect(result.map((m) => m.id)).toEqual(['with-menu', 'no-menu']);
    });
});
