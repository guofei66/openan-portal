// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Contract tests for the orchestration-center SOURCE plugin.
 *
 * NOTE: the source plugin is currently disabled in plugins/plugin-overrides.json
 * (enabled:false) — its prebuilt bundle under portal/public/plugins/ replaces
 * it at runtime. The governance contract still applies to the source tree, so
 * these tests validate the manifest/i18n/component contract regardless of the
 * discovery switch (discovery behavior itself is covered by
 * tests/plugin-discovery.test.js).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import manifestModule from '../plugin.manifest.js';
import {
    verifySourcePluginContract,
    resolveLocaleKey,
} from '../../../tests/helpers/plugin-contract-utils.js';
import {
    createMockApi,
    createMockPortalValue,
    renderWithPortalContext,
} from '../../../tests/helpers/portal-test-utils.jsx';
import { loadPluginI18n } from '../../../portal/src/i18n/index.js';

const ORCHESTRATE_BASE = '/rest/v1/orchestrate';

/** API payloads matching the response shapes the component expects on mount. */
const workflowListPayload = {
    status: 'success',
    data: [{
        workflow_id: 'wf-orch-1',
        name: 'Mock Orchestration Flow',
        description: 'A workflow returned by the contract-test api mock',
        tags: ['contract-test'],
    }],
};
const templatesPayload = {
    status: 'success',
    data: [{
        id: 'tpl-quick-fix',
        name: 'Quick Fix Template',
        description: 'Import this template to bootstrap a workflow',
        step_count: 3,
        agent_count: 2,
        tags: ['demo'],
    }],
};

function createOrchestrationApi() {
    return createMockApi({
        get: vi.fn(async (url) => {
            if (url === `${ORCHESTRATE_BASE}/workflows`) return workflowListPayload;
            if (url === `${ORCHESTRATE_BASE}/templates`) return templatesPayload;
            return { status: 'success', data: [] };
        }),
    });
}

describe('orchestration-center source plugin contract', () => {
    let contract;

    beforeAll(async () => {
        // Throws on ANY contract violation (SDK shape, folder id, menu↔routes,
        // i18n namespace/keys, lazy component resolution).
        contract = await verifySourcePluginContract({
            manifest: manifestModule,
            expectedId: 'orchestration-center',
        });
        await loadPluginI18n(contract.manifest.i18n);
    });

    it('passes the full source-plugin contract', () => {
        expect(contract.manifest.id).toBe('orchestration-center');
        expect(contract.manifest.name).toBe('Orchestration Center');
        expect(contract.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(contract.components).toHaveLength(contract.manifest.routes.length);
        expect(typeof contract.components[0]).toBe('function');
    });

    it('declares its menu entry and route (order/route snapshot)', () => {
        expect(
            contract.manifest.menu.map(({ id, labelKey, order, route }) => ({ id, labelKey, order, route }))
        ).toEqual([
            { id: 'orchestration', labelKey: 'orchestration-center:orchestration.title', order: 2, route: '/orchestration' },
        ]);
        expect(
            contract.manifest.routes.map(({ path, menuId }) => ({ path, menuId }))
        ).toEqual([
            { path: '/orchestration', menuId: 'orchestration' },
        ]);
    });

    it('uses the plugin id as i18n namespace and both en/zh carry the menu title', () => {
        expect(contract.manifest.i18n.namespace).toBe('orchestration-center');
        expect(Object.keys(contract.locales).sort()).toEqual(['en', 'zh']);
        for (const resources of Object.values(contract.locales)) {
            expect(resolveLocaleKey(resources, 'orchestration.title')).toBeDefined();
        }
        expect(resolveLocaleKey(contract.locales.en, 'orchestration.title')).toBe('Orchestration');
        expect(resolveLocaleKey(contract.locales.zh, 'orchestration.title')).toBe('编排中心');
    });

    it('renders the route component inside the Portal context (mount smoke)', async () => {
        const OrchestrationCenter = contract.components[0];
        expect(typeof OrchestrationCenter).toBe('function');
        const api = createOrchestrationApi();
        renderWithPortalContext(<OrchestrationCenter />, { value: createMockPortalValue({ api }) });

        // Localized welcome view: heading + method cards.
        expect(screen.getByRole('heading', { name: 'Build Workflow' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'SolutionPackage Import' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Graph Builder' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Natural Language Orchestration' })).toBeInTheDocument();

        // Mount fetches the workflow list and the template list…
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${ORCHESTRATE_BASE}/workflows`));
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${ORCHESTRATE_BASE}/templates`));
        // …and renders the template fetched from the mock.
        await waitFor(() => expect(screen.getByText('Quick Fix Template')).toBeInTheDocument());
    });
});
