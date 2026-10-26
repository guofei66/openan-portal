// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Contract tests for the execution-center SOURCE plugin.
 *
 * Covers the governance contract (SDK shape, folder identity, menu↔routes,
 * i18n completeness, lazy components) plus mount smokes for the main view:
 * on mount the component pulls agent cards and the workflow list, and a
 * deep link ?workflow=<id> selects and fetches that workflow.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
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

const API_BASE = '/rest/v1/orchestrate';

/**
 * API payloads matching the response shapes ExecutionCenter expects
 * (api.get resolves to the axios-unwrapped payload).
 */
const agentCardsPayload = {
    data: [{ name: 'Workbench Agent' }, { name: 'Field Agent' }],
};
const workflowListPayload = {
    status: 'success',
    data: [{
        workflow_id: 'wf-1',
        name: 'Contract Test Workflow',
        description: 'A workflow returned by the contract-test api mock',
        tags: ['contract-test'],
        created_at: '2026-10-01T08:00:00Z',
        status: 'success',
    }],
};
// Empty steps keep the deep-link canvas on the lightweight empty-graph
// placeholder instead of mounting the React Flow canvas in jsdom.
const workflowDetailPayload = {
    status: 'success',
    data: {
        id: 'wf-1',
        name: 'Contract Test Workflow',
        description: 'A workflow returned by the contract-test api mock',
        tags: ['contract-test'],
        steps: [],
    },
};

function createExecutionApi() {
    return createMockApi({
        get: vi.fn(async (url) => {
            if (url === `${API_BASE}/agent-cards`) return agentCardsPayload;
            if (url === `${API_BASE}/workflows`) return workflowListPayload;
            if (url === `${API_BASE}/workflows/wf-1`) return workflowDetailPayload;
            return { status: 'success', data: [] };
        }),
    });
}

describe('execution-center source plugin contract', () => {
    let contract;

    beforeAll(async () => {
        // Element.prototype.scrollTo is polyfilled globally in tests/setup.js
        // (the auto-scroll log effect on mount needs it).
        //
        // Throws on ANY contract violation (SDK shape, folder id, menu↔routes,
        // i18n namespace/keys, lazy component resolution).
        contract = await verifySourcePluginContract({
            manifest: manifestModule,
            expectedId: 'execution-center',
        });
        await loadPluginI18n(contract.manifest.i18n);
    });

    afterEach(() => {
        // Deep-link tests rewrite the URL — restore a clean search for the
        // rest of the file (jsdom keeps the document URL across tests).
        window.history.replaceState({}, '', '/');
    });

    it('passes the full source-plugin contract', () => {
        expect(contract.manifest.id).toBe('execution-center');
        expect(contract.manifest.name).toBe('Execution Center');
        expect(contract.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(contract.components).toHaveLength(contract.manifest.routes.length);
        expect(typeof contract.components[0]).toBe('function');
    });

    it('declares its menu entry and route (order/route snapshot)', () => {
        expect(
            contract.manifest.menu.map(({ id, labelKey, order, route }) => ({ id, labelKey, order, route }))
        ).toEqual([
            { id: 'execution', labelKey: 'execution-center:execution.title', order: 3, route: '/execution' },
        ]);
        expect(
            contract.manifest.routes.map(({ path, menuId }) => ({ path, menuId }))
        ).toEqual([
            { path: '/execution', menuId: 'execution' },
        ]);
    });

    it('uses the plugin id as i18n namespace and both en/zh carry the menu title', () => {
        expect(contract.manifest.i18n.namespace).toBe('execution-center');
        expect(Object.keys(contract.locales).sort()).toEqual(['en', 'zh']);
        for (const resources of Object.values(contract.locales)) {
            expect(resolveLocaleKey(resources, 'execution.title')).toBeDefined();
        }
        expect(resolveLocaleKey(contract.locales.en, 'execution.title')).toBe('Execution Center');
        expect(resolveLocaleKey(contract.locales.zh, 'execution.title')).toBe('工作流执行');
    });

    it('renders the main view and fetches agent cards + workflow list on mount', async () => {
        const ExecutionCenter = contract.components[0];
        expect(typeof ExecutionCenter).toBe('function');
        const api = createExecutionApi();
        renderWithPortalContext(<ExecutionCenter />, { value: createMockPortalValue({ api }) });

        // Localized header + search controls.
        expect(screen.getByRole('heading', { name: 'Execution Center' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Fuzzy' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Exact' })).toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();

        // Mount effects pull the agent cards and the workflow (tag) list.
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${API_BASE}/agent-cards`));
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${API_BASE}/workflows`));
        // The fetched host agent appears in the dispatch dropdown.
        await waitFor(() => expect(screen.getByText('Workbench Agent')).toBeInTheDocument());
    });

    it('deep link ?workflow=<id> fetches that workflow and selects it', async () => {
        // ExecutionCenter reads window.location.search directly (the PortalApp
        // owns the router), so seed the URL before mounting the component.
        window.history.replaceState({}, '', '/?workflow=wf-1');
        const ExecutionCenter = contract.components[0];
        expect(typeof ExecutionCenter).toBe('function');
        const api = createExecutionApi();
        renderWithPortalContext(<ExecutionCenter />, { value: createMockPortalValue({ api }) });

        // The deep-link effect selects wf-1 and fetches its detail graph…
        await waitFor(() => expect(api.get).toHaveBeenCalledWith(`${API_BASE}/workflows/wf-1`));
        // …and the matched-workflow panel lists the deep-linked workflow.
        await waitFor(() => expect(screen.getByText('Contract Test Workflow')).toBeInTheDocument());
    });
});
