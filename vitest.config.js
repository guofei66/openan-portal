// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest configuration — single source of truth for the whole workspace.
 *
 * Test layout (mirrors the workspace structure):
 *   packages/portal-sdk/tests/**   — SDK contract (manifest validation, config loader, context)
 *   portal/tests/**                — Portal shell (auth/theme/i18n/api/components/loaders)
 *   plugins/<name>/tests/**        — Per-plugin contract + component tests
 *   tests/**                       — Cross-cutting checks (bundle artifact contract, etc.)
 *
 * Aliases mirror portal/vite.config.js so source imports resolve identically
 * in tests and in the real build.
 */
import { defineConfig } from 'vitest/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const portalSrc = path.resolve(rootDir, 'portal', 'src');

/**
 * Test-time twin of the `openan-plugin-discovery` Vite plugin in
 * portal/vite.config.js — serves the `virtual:openan-plugins` module so
 * tests can import portal/src/plugins.config.js without a dev server.
 * Same discovery rules: plugins/<name>/plugin.manifest.js, honoring
 * plugins/plugin-overrides.json.
 */
function openanPluginDiscoveryForTests() {
    const virtualModuleId = 'virtual:openan-plugins';
    const resolvedVirtualId = '\0' + virtualModuleId;
    const pluginsDir = path.resolve(rootDir, 'plugins');

    function buildModuleCode() {
        const overridesPath = path.join(pluginsDir, 'plugin-overrides.json');
        let overrides = {};
        if (fs.existsSync(overridesPath)) {
            overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
        }
        const names = fs.existsSync(pluginsDir)
            ? fs.readdirSync(pluginsDir, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => d.name)
                .filter((name) =>
                    fs.existsSync(path.join(pluginsDir, name, 'plugin.manifest.js'))
                )
                .filter((name) => overrides[name]?.enabled !== false)
            : [];

        const entries = names.map((name) => {
            const manifestPath = path
                .join(pluginsDir, name, 'plugin.manifest.js')
                .split(path.sep)
                .join('/');
            return `    { id: ${JSON.stringify(name)}, enabled: true, manifest: () => import(${JSON.stringify(manifestPath)}) },`;
        });

        return `export default {\n    plugins: [\n${entries.join('\n')}\n    ],\n};\n`;
    }

    return {
        name: 'openan-plugin-discovery-tests',
        resolveId(id) {
            if (id === virtualModuleId) return resolvedVirtualId;
            return null;
        },
        load(id) {
            if (id === resolvedVirtualId) return buildModuleCode();
            return null;
        },
    };
}

export default defineConfig({
    plugins: [openanPluginDiscoveryForTests()],
    resolve: {
        alias: {
            '@': portalSrc,
            '@openan/portal-sdk': path.resolve(rootDir, 'packages/portal-sdk/src/index.js'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./tests/setup.js'],
        include: [
            'packages/portal-sdk/tests/**/*.test.{js,jsx}',
            'portal/tests/**/*.test.{js,jsx}',
            'plugins/*/tests/**/*.test.{js,jsx}',
            'tests/**/*.test.{js,jsx}',
        ],
        exclude: ['**/node_modules/**', '**/dist/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: [
                'packages/portal-sdk/src/**/*.{js,jsx}',
                'portal/src/**/*.{js,jsx}',
                'plugins/*/src/**/*.{js,jsx}',
            ],
            exclude: [
                'portal/src/main.jsx',   // dev entry, no logic
                'portal/src/App.jsx',    // dev-only wrapper
                'plugins/*/src/standalone.jsx', // dev-only standalone entries
            ],
            // Merge-quality ratchet: global floors sit slightly below the
            // current suite's real numbers (≈40% stmt / 29% br / 39% fn /
            // 41% ln) so ordinary refactors pass, while removing tests or
            // shipping large untested modules fails the gate. The plugin
            // contract core (portal-sdk) holds a much higher bar.
            thresholds: {
                statements: 38,
                branches: 27,
                functions: 33,
                lines: 38,
                'packages/portal-sdk/src/**': {
                    statements: 90,
                    branches: 90,
                    functions: 45,
                    lines: 90,
                },
            },
        },
    },
});
