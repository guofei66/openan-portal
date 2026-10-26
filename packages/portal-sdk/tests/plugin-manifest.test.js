// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/plugin-manifest.js';

/** Minimal valid manifest — every test below starts from this shape. */
function validManifest(overrides = {}) {
    return {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        menu: [{
            id: 'test',
            labelKey: 'test-plugin:nav.test',
            order: 1,
            route: '/test',
        }],
        routes: [{
            path: '/test',
            component: () => Promise.resolve({ default: () => null }),
            menuId: 'test',
        }],
        ...overrides,
    };
}

describe('validateManifest', () => {
    it('accepts a minimal valid manifest and returns the same reference', () => {
        const m = validManifest();
        expect(validateManifest(m)).toBe(m);
    });

    it('accepts a manifest without menu (menu is optional)', () => {
        const m = validManifest({ menu: undefined });
        expect(validateManifest(m)).toBe(m);
    });

    it('accepts a manifest with valid i18n declaration', () => {
        const m = validManifest({
            i18n: {
                namespace: 'test-plugin',
                resources: { en: () => Promise.resolve({}), zh: () => Promise.resolve({}) },
            },
        });
        expect(validateManifest(m)).toBe(m);
    });

    it('rejects non-object manifests', () => {
        expect(() => validateManifest(null)).toThrow('Plugin manifest must be an object');
        expect(() => validateManifest(undefined)).toThrow('Plugin manifest must be an object');
        expect(() => validateManifest('plugin')).toThrow('Plugin manifest must be an object');
    });

    it('collects ALL missing required fields in one error message', () => {
        const m = validManifest({ id: '', name: null, version: undefined, routes: 'nope' });
        expect(() => validateManifest(m)).toThrow(/manifest\.id is required/);
        expect(() => validateManifest(m)).toThrow(/manifest\.name is required/);
        expect(() => validateManifest(m)).toThrow(/manifest\.version is required/);
        expect(() => validateManifest(m)).toThrow(/manifest\.routes must be an array/);
    });

    it('reports the plugin id in the error message when known', () => {
        const m = validManifest({ version: '' });
        expect(() => validateManifest(m)).toThrow('Invalid plugin manifest "test-plugin"');
    });

    it('uses "?" when the manifest id itself is invalid', () => {
        const m = validManifest({ id: null, version: null });
        expect(() => validateManifest(m)).toThrow('Invalid plugin manifest "?"');
    });

    it('rejects routes with missing path or non-function component', () => {
        const m = validManifest({
            routes: [{ component: () => Promise.resolve({}) }, { path: '/ok' }],
        });
        expect(() => validateManifest(m)).toThrow(/routes\[0\]\.path is required/);
        expect(() => validateManifest(m)).toThrow(/routes\[1\]\.component must be a lazy-import function/);
    });

    it('rejects a non-array menu', () => {
        const m = validManifest({ menu: { id: 'not-an-array' } });
        expect(() => validateManifest(m)).toThrow('manifest.menu must be an array if present');
    });

    it('rejects i18n without namespace', () => {
        const m = validManifest({ i18n: { resources: { en: () => Promise.resolve({}) } } });
        expect(() => validateManifest(m)).toThrow('manifest.i18n.namespace is required when i18n is present');
    });

    it('rejects i18n without resources object', () => {
        const m = validManifest({ i18n: { namespace: 'test-plugin' } });
        expect(() => validateManifest(m)).toThrow('manifest.i18n.resources must be an object');
    });
});
