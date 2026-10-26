// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * plugins.config.js registry contract.
 *
 * The registry mixes source plugins (auto-discovered via
 * virtual:openan-plugins) with prebuilt bundle entries. These tests pin:
 *   - the source part equals the discovery result (execution/skill center in,
 *     the orchestration-center SOURCE plugin absent — its bundle replaces it),
 *   - exactly the five bundle entries exist with the bundle shape
 *     { id, mode:'bundle', enabled:true, entry:'/plugins/<id>' },
 *   - every bundle entry's entry path maps to a matching local artifact
 *     directory when portal/public/plugins/<id> is present.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pluginsConfig from '../portal/src/plugins.config.js';
import discovered from 'virtual:openan-plugins';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = path.join(repoRoot, 'portal', 'public', 'plugins');

const EXPECTED_BUNDLE_IDS = [
    'an-ontology',
    'observation-center',
    'orchestration-center',
    'registry-center',
    'virtual-showroom',
];

describe('plugins.config.js registry', () => {
    const sourceEntries = pluginsConfig.plugins.filter((p) => p.mode === undefined);
    const bundleEntries = pluginsConfig.plugins.filter((p) => p.mode === 'bundle');

    it('is exactly the discovered source plugins followed by the bundle entries', () => {
        expect(sourceEntries).toEqual(discovered.plugins);
        expect(bundleEntries).toHaveLength(EXPECTED_BUNDLE_IDS.length);
        expect(pluginsConfig.plugins).toHaveLength(discovered.plugins.length + EXPECTED_BUNDLE_IDS.length);
    });

    it('registers the enabled source plugins (execution-center + skill-center, no orchestration-center source)', () => {
        const sourceIds = sourceEntries.map((p) => p.id);
        expect(sourceIds).toContain('execution-center');
        expect(sourceIds).toContain('skill-center');
        expect(sourceIds).not.toContain('orchestration-center');
    });

    it('registers all five bundle entries with the exact bundle shape', () => {
        expect(bundleEntries.map((p) => p.id).sort()).toEqual([...EXPECTED_BUNDLE_IDS].sort());
        for (const entry of bundleEntries) {
            expect(entry).toEqual({
                id: entry.id,
                mode: 'bundle',
                entry: `/plugins/${entry.id}`,
                enabled: true,
            });
        }
    });

    it('maps every bundle entry to a matching local artifact directory (when artifacts exist)', () => {
        for (const entry of bundleEntries) {
            const artifactDir = path.join(artifactsRoot, entry.id);
            // Prebuilt artifacts are gitignored — skip folders that are absent
            // locally; bundle-artifacts.test.js covers them when present.
            if (!fs.existsSync(artifactDir)) continue;
            const manifestPath = path.join(artifactDir, 'plugin.manifest.json');
            expect(fs.existsSync(manifestPath)).toBe(true);
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            expect(manifest.id).toBe(entry.id);
        }
    });
});
