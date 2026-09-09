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

/**
 * Standalone bundle build for the Registry Center plugin (UMD artifact).
 *
 * Output (dist-bundle/):
 *   index.js              ← UMD, sets window.__OPENAN_PLUGIN__registry_center
 *   index.css             ← compiled styles
 *   plugin.manifest.json  ← runtime metadata
 *
 * EXTERNAL (provided by Portal at runtime via globals):
 *   react, react-dom, react-i18next, @openan/portal-sdk
 *
 * BUNDLED (self-contained):
 *   lucide-react, react-markdown, remark-gfm
 *
 * Usage: node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const root = import.meta.dirname;
const globalName = '__OPENAN_PLUGIN__registry_center';

function buildManifestJson() {
    const src = readFileSync(path.resolve(root, 'plugin.manifest.js'), 'utf-8');
    const pick = (key, fallback) => src.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`))?.[1] || fallback;
    return JSON.stringify({
        id: pick('id', 'registry-center'),
        name: pick('name', 'Registry Center'),
        version: pick('version', '0.0.0'),
        backend: src.includes('gateway:') ? { gateway: pick('gateway', '') } : undefined,
        menu: [{
            id: pick("id: '", 'agents'),
            labelKey: src.match(/labelKey:\s*'([^']+)'/)?.[1],
            order: Number(src.match(/order:\s*(\d+)/)?.[1] || 99),
            route: src.match(/route:\s*'([^']+)'/)?.[1],
        }],
        routes: [{
            path: src.match(/path:\s*'([^']+)'/)?.[1] || '/registry',
            menuId: src.match(/menuId:\s*'([^']+)'/)?.[1],
        }],
        entry: 'index.js',
        css: 'index.css',
    }, null, 2);
}

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'emit-plugin-manifest-json',
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'plugin.manifest.json', source: buildManifestJson() });
            },
        },
    ],
    resolve: {
        alias: {
            '@openan/portal-sdk': path.resolve(root, '../../packages/portal-sdk/src/index.js'),
        },
    },
    build: {
        outDir: 'dist-bundle',
        lib: {
            entry: path.resolve(root, 'src/index.jsx'),
            name: globalName,
            formats: ['umd'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            external: ['react', 'react-dom', 'react-dom/client', 'react-i18next', '@openan/portal-sdk'],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react-dom/client': 'ReactDOM',
                    'react-i18next': 'ReactI18next',
                    '@openan/portal-sdk': 'OpenANPortalSDK',
                },
                assetFileNames: 'index.css',
            },
        },
        cssCodeSplit: false,
    },
});
