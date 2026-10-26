// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Plugin contract verification helpers.
 *
 * The Portal's governance rule: every plugin (source or prebuilt bundle)
 * must satisfy its contract before it can ship. These helpers encode the
 * contract so per-plugin tests stay one-liners:
 *
 *   import manifest from '../plugin.manifest.js';
 *   import { verifySourcePluginContract } from '../../../tests/helpers/plugin-contract-utils.js';
 *   verifySourcePluginContract({ manifest: manifest, expectedId: 'skill-center' });
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest } from '@openan/portal-sdk';

/** Resolve a dot-separated i18n key against a nested locale object. */
export function resolveLocaleKey(resources, dottedKey) {
    return dottedKey.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), resources);
}

/**
 * Verify the contract of a SOURCE plugin (plugins/<id>/plugin.manifest.js).
 *
 * Checks:
 *   1. Passes SDK validateManifest (id/name/version/routes shape)
 *   2. manifest.id matches the plugin folder name
 *   3. menu ↔ routes consistency (menu.route exists; route.menuId known;
 *      numeric order; labelKey present)
 *   4. i18n namespace equals the plugin id; every menu labelKey uses the
 *      namespace prefix and resolves in EVERY declared locale
 *   5. every route's lazy component loader resolves to a component
 *
 * @returns {{ manifest: object, locales: Object<string, object>, components: any[] }}
 */
export async function verifySourcePluginContract({ manifest: manifestModule, expectedId }) {
    const manifest = manifestModule.default ?? manifestModule;

    // 1. SDK shape validation
    validateManifest(manifest);

    // 2. Identity — id must match the folder (auto-discovery key)
    if (manifest.id !== expectedId) {
        throw new Error(`manifest.id "${manifest.id}" does not match plugin folder "${expectedId}"`);
    }

    // 3. Menu ↔ routes consistency
    const routePaths = new Set(manifest.routes.map((r) => r.path));
    const menuIds = new Set((manifest.menu ?? []).map((m) => m.id));
    for (const m of manifest.menu ?? []) {
        if (m.labelKey == null) throw new Error(`menu item "${m.id}" is missing labelKey`);
        if (typeof m.order !== 'number') throw new Error(`menu item "${m.id}" needs a numeric order (got ${JSON.stringify(m.order)})`);
        if (!routePaths.has(m.route)) {
            throw new Error(`menu item "${m.id}" route "${m.route}" has no matching plugin route`);
        }
    }
    for (const r of manifest.routes) {
        if (r.menuId && !menuIds.has(r.menuId)) {
            throw new Error(`route "${r.path}" references unknown menuId "${r.menuId}"`);
        }
    }

    // 4. i18n contract
    const locales = {};
    if (manifest.i18n) {
        const ns = manifest.i18n.namespace;
        if (ns !== manifest.id) {
            throw new Error(`i18n.namespace "${ns}" should equal the plugin id "${manifest.id}"`);
        }
        for (const [lng, loader] of Object.entries(manifest.i18n.resources ?? {})) {
            const mod = await loader();
            locales[lng] = mod.default ?? mod;
        }
        for (const m of manifest.menu ?? []) {
            if (!m.labelKey.startsWith(`${ns}:`)) {
                throw new Error(`menu "${m.id}" labelKey "${m.labelKey}" must use the namespace prefix "${ns}:"`);
            }
            const key = m.labelKey.slice(ns.length + 1);
            for (const [lng, res] of Object.entries(locales)) {
                if (resolveLocaleKey(res, key) === undefined) {
                    throw new Error(`locale "${lng}" is missing i18n key "${key}" (menu "${m.id}")`);
                }
            }
        }
    }

    // 5. Lazy route components resolve
    const components = [];
    for (const r of manifest.routes) {
        const mod = await r.component();
        const Component = mod.default ?? mod;
        if (typeof Component !== 'function' && typeof Component !== 'object') {
            throw new Error(`route "${r.path}" component loader did not resolve to a component`);
        }
        components.push(Component);
    }

    return { manifest, locales, components };
}

/** The window global a plugin UMD bundle must assign (dashes → underscores). */
export function expectedBundleGlobalKey(id) {
    return `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
}

/**
 * Verify the contract of a PREBUILT BUNDLE artifact directory
 * (portal/public/plugins/<id>/ — manifest.json + UMD js + css).
 *
 * Checks:
 *   1. plugin.manifest.json parses and carries id/name/version/menu/routes
 *   2. manifest.id matches the directory name
 *   3. menu ↔ routes consistency (same rules as source plugins)
 *   4. declared entry js + css files exist on disk
 *   5. the UMD bundle contains the required global assignment marker
 *
 * @param {string} artifactDir — absolute path to the artifact directory
 * @returns {{ manifest: object, dir: string }}
 */
export function verifyBundleArtifact(artifactDir) {
    const dirName = path.basename(artifactDir);
    const manifestPath = path.join(artifactDir, 'plugin.manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`bundle artifact "${dirName}" is missing plugin.manifest.json`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    for (const field of ['id', 'name', 'version']) {
        if (!manifest[field] || typeof manifest[field] !== 'string') {
            throw new Error(`bundle manifest "${dirName}" is missing string field "${field}"`);
        }
    }
    if (manifest.id !== dirName) {
        throw new Error(`bundle manifest.id "${manifest.id}" does not match artifact directory "${dirName}"`);
    }
    if (!Array.isArray(manifest.menu) || manifest.menu.length === 0) {
        throw new Error(`bundle manifest "${dirName}" must declare a non-empty menu array`);
    }
    if (!Array.isArray(manifest.routes) || manifest.routes.length === 0) {
        throw new Error(`bundle manifest "${dirName}" must declare a non-empty routes array`);
    }

    const routePaths = new Set(manifest.routes.map((r) => r.path));
    const menuIds = new Set(manifest.menu.map((m) => m.id));
    for (const m of manifest.menu) {
        if (typeof m.order !== 'number') throw new Error(`bundle menu item "${m.id}" needs a numeric order`);
        if (!routePaths.has(m.route)) throw new Error(`bundle menu item "${m.id}" route "${m.route}" has no matching route`);
    }
    for (const r of manifest.routes) {
        if (r.menuId && !menuIds.has(r.menuId)) throw new Error(`bundle route "${r.path}" references unknown menuId "${r.menuId}"`);
    }

    const entryFile = manifest.entry || 'index.js';
    const jsPath = path.join(artifactDir, entryFile);
    if (!fs.existsSync(jsPath)) {
        throw new Error(`bundle artifact "${dirName}" is missing its entry file "${entryFile}"`);
    }
    if (manifest.css && !fs.existsSync(path.join(artifactDir, manifest.css))) {
        throw new Error(`bundle artifact "${dirName}" is missing its css file "${manifest.css}"`);
    }

    const js = fs.readFileSync(jsPath, 'utf-8');
    const globalKey = expectedBundleGlobalKey(manifest.id);
    if (!js.includes(globalKey)) {
        throw new Error(`bundle "${dirName}" entry js does not assign the required global "${globalKey}"`);
    }

    return { manifest, dir: artifactDir };
}
