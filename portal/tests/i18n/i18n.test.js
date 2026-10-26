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

import { describe, it, expect, vi } from 'vitest';
import i18n, { registerPluginI18n, loadPluginI18n } from '../../src/i18n/index.js';

/**
 * The i18n singleton is shared across tests in this file — every test uses a
 * UNIQUE namespace (ut-ns-*) so registrations cannot pollute each other.
 */
describe('base i18n singleton', () => {
    it('is initialized with base en/zh translation bundles', () => {
        expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
        expect(i18n.hasResourceBundle('zh', 'translation')).toBe(true);
        expect(i18n.options.fallbackLng).toContain('en');
    });

    it('translates base keys in both languages', async () => {
        await i18n.changeLanguage('en');
        expect(i18n.t('login.title')).toBe('Access Password');
        expect(i18n.t('nav.subtitle')).toBe('Open Autonomous Networks');
        await i18n.changeLanguage('zh');
        expect(i18n.t('login.title')).toBe('访问密码');
        expect(i18n.t('nav.subtitle')).toBe('开放自治网络');
    });

    it('returns the key itself for missing translations', async () => {
        await i18n.changeLanguage('en');
        expect(i18n.t('definitely.not.a.key')).toBe('definitely.not.a.key');
        await i18n.changeLanguage('zh');
        expect(i18n.t('definitely.not.a.key')).toBe('definitely.not.a.key');
    });
});

describe('registerPluginI18n', () => {
    it('registers a namespace and makes "ns:key" lookups resolve', async () => {
        registerPluginI18n('ut-ns-a', {
            en: { greeting: 'Hello' },
            zh: { greeting: '你好' },
        });
        expect(i18n.options.ns).toContain('ut-ns-a');

        await i18n.changeLanguage('en');
        expect(i18n.t('ut-ns-a:greeting')).toBe('Hello');
        await i18n.changeLanguage('zh');
        expect(i18n.t('ut-ns-a:greeting')).toBe('你好');
    });

    it('does not overwrite an already-registered bundle (idempotent)', async () => {
        registerPluginI18n('ut-ns-b', { en: { key: 'first' } });
        registerPluginI18n('ut-ns-b', { en: { key: 'second' } });
        await i18n.changeLanguage('en');
        expect(i18n.t('ut-ns-b:key')).toBe('first');
    });

    it('appends the namespace to i18n.options.ns only once', () => {
        registerPluginI18n('ut-ns-c', { en: { key: 'value' } });
        registerPluginI18n('ut-ns-c', { en: { key: 'value' } });
        const occurrences = i18n.options.ns.filter((ns) => ns === 'ut-ns-c');
        expect(occurrences).toHaveLength(1);
    });

    it('still declares the namespace when the bundle is already registered', async () => {
        // Simulate a bundle added through a path that did not declare the ns:
        // addResourceBundle auto-declares, so strip the declaration afterwards.
        i18n.addResourceBundle('en', 'ut-ns-d', { key: 'value' }, true, true);
        i18n.options.ns = i18n.options.ns.filter((ns) => ns !== 'ut-ns-d');
        expect(i18n.options.ns).not.toContain('ut-ns-d');

        // registerPluginI18n skips re-adding the existing bundle …
        registerPluginI18n('ut-ns-d', { en: { key: 'must-not-overwrite' } });
        // … but still declares the namespace (idempotent ns push) …
        expect(i18n.options.ns).toContain('ut-ns-d');
        // … and the previously registered bundle is kept intact.
        await i18n.changeLanguage('en');
        expect(i18n.t('ut-ns-d:key')).toBe('value');
    });
});

describe('loadPluginI18n', () => {
    it('returns early when the config or namespace is missing', async () => {
        await expect(loadPluginI18n(null)).resolves.toBeUndefined();
        await expect(loadPluginI18n(undefined)).resolves.toBeUndefined();
        await expect(loadPluginI18n({})).resolves.toBeUndefined();
        await expect(
            loadPluginI18n({ resources: { en: vi.fn() } })
        ).resolves.toBeUndefined();
    });

    it('executes every locale loader and registers the namespace', async () => {
        const enLoader = vi.fn(async () => ({ default: { hello: 'Hello' } }));
        const zhLoader = vi.fn(async () => ({ default: { hello: '你好' } }));

        await loadPluginI18n({
            namespace: 'ut-ns-e',
            resources: { en: enLoader, zh: zhLoader },
        });

        expect(enLoader).toHaveBeenCalledTimes(1);
        expect(zhLoader).toHaveBeenCalledTimes(1);
        expect(i18n.options.ns).toContain('ut-ns-e');

        await i18n.changeLanguage('en');
        expect(i18n.t('ut-ns-e:hello')).toBe('Hello');
        await i18n.changeLanguage('zh');
        expect(i18n.t('ut-ns-e:hello')).toBe('你好');
    });

    it('accepts loaders that return plain objects (no .default export)', async () => {
        await loadPluginI18n({
            namespace: 'ut-ns-f',
            resources: { en: async () => ({ plain: 'Plain value' }) },
        });
        await i18n.changeLanguage('en');
        expect(i18n.t('ut-ns-f:plain')).toBe('Plain value');
    });

    it('declares the namespace but adds no bundle when resources is empty', async () => {
        await loadPluginI18n({ namespace: 'ut-ns-g' });
        expect(i18n.options.ns).toContain('ut-ns-g');
        expect(i18n.hasResourceBundle('en', 'ut-ns-g')).toBe(false);
    });
});
