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
 * STANDALONE dev config — runs the Registry Center website by itself,
 * without the Portal. Uses MockPortal to satisfy usePortalContext().
 *
 * Usage:
 *   node ../../node_modules/vite/bin/vite.js --config vite.standalone.config.js
 *   → http://localhost:5100
 *
 * The plugin talks to the registry backend directly (mock :5000 or real).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = import.meta.dirname;
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
    css: {
        // Tailwind + PostCSS so the plugin's utility classes compile in
        // standalone mode. Points at the plugin's own postcss config.
        postcss: path.resolve(root, 'postcss.standalone.config.js'),
    },
    server: {
        port: 5100,
        cors: true,
        proxy: {
            // Registry backend (plugin's own API) — direct, no gateway prefix
            '/rest/v1/registry': {
                target: process.env.REGISTRY_URL || 'http://127.0.0.1:5000',
                changeOrigin: true, secure: false,
            },
        },
    },
    plugins: [react()],
    resolve: {
        // Array form: entries are matched in order — the more specific
        // '@openan/portal-sdk/standalone' must come BEFORE the bare
        // '@openan/portal-sdk' prefix alias.
        alias: [
            {
                find: '@openan/portal-sdk/standalone',
                replacement: path.resolve(workspaceRoot, 'packages/portal-sdk/src/standalone.jsx'),
            },
            {
                find: '@openan/portal-sdk',
                replacement: path.resolve(workspaceRoot, 'packages/portal-sdk/src/index.js'),
            },
        ],
    },
});
