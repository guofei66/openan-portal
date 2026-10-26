// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Prebuilt bundle artifact contract (portal/public/plugins/).
 *
 * The five locally built artifacts are gitignored, so the whole suite is
 * skipped when the directory is missing. When present, every artifact must
 * satisfy the bundle contract: plugin.manifest.json + UMD entry (with the
 * __OPENAN_PLUGIN__<id> global assignment) + css, plus menu labelKeys and
 * menu↔route consistency. The artifact set must exactly match the bundle
 * entries registered in plugins.config.js — no orphans, no missing entries.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pluginsConfig from '../portal/src/plugins.config.js';
import {
    verifyBundleArtifact,
    expectedBundleGlobalKey,
} from './helpers/plugin-contract-utils.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = path.join(repoRoot, 'portal', 'public', 'plugins');

const BUNDLE_IDS = [
    'registry-center',
    'orchestration-center',
    'observation-center',
    'virtual-showroom',
    'an-ontology',
];

describe.skipIf(!fs.existsSync(artifactsRoot))('prebuilt bundle artifacts contract', () => {
    it.each(BUNDLE_IDS)('artifact "%s" satisfies the full bundle contract', (id) => {
        // Throws on any violation: manifest fields, folder identity,
        // menu↔routes consistency, entry/css files on disk, UMD global marker.
        const { manifest, dir } = verifyBundleArtifact(path.join(artifactsRoot, id));
        expect(manifest.id).toBe(id);
        expect(path.basename(dir)).toBe(id);
    });

    it.each(BUNDLE_IDS)('bundle "%s" menu items carry labelKeys and agree with its routes', (id) => {
        const { manifest } = verifyBundleArtifact(path.join(artifactsRoot, id));
        expect(manifest.menu.length).toBeGreaterThan(0);
        const routePaths = manifest.routes.map((r) => r.path);
        for (const route of routePaths) {
            expect(typeof route).toBe('string');
            expect(route.length).toBeGreaterThan(0);
        }
        for (const item of manifest.menu) {
            expect(typeof item.labelKey).toBe('string');
            expect(item.labelKey.length).toBeGreaterThan(0);
            expect(routePaths).toContain(item.route);
        }
    });

    it.each(BUNDLE_IDS)('bundle "%s" UMD entry assigns the required window global', (id) => {
        const { manifest } = verifyBundleArtifact(path.join(artifactsRoot, id));
        const js = fs.readFileSync(path.join(artifactsRoot, id, manifest.entry || 'index.js'), 'utf-8');
        expect(js).toContain(expectedBundleGlobalKey(id));
    });

    it('exactly covers the bundle entries in plugins.config.js (no orphan artifacts, no missing entries)', () => {
        const onDisk = fs.readdirSync(artifactsRoot, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
        const configured = pluginsConfig.plugins
            .filter((p) => p.mode === 'bundle')
            .map((p) => p.id)
            .sort();
        expect(onDisk).toEqual(configured);
    });
});
