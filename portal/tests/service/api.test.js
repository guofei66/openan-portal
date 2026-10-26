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

import { describe, it, expect, vi, afterEach } from 'vitest';
import api, {
    getBaseUrl,
    createApi,
    authCheck,
    login,
    logout,
    parsePdf,
    handlePlan,
    generateWorkflowFromIntent,
    matchWorkflowsTopN,
    getStartProcessStreamUrl,
    getDispatchStreamUrl,
} from '../../src/service/api.js';

/**
 * Tests for the shared axios instance and endpoint helpers.
 *
 * Interceptors are exercised through a mocked axios adapter:
 *   success → the adapter resolves an axios-shaped response object,
 *   failure → the adapter throws an axios-shaped error ({ response: { status } }),
 *   which flows through the registered rejection interceptor.
 */
const ORIGINAL_ADAPTER = api.defaults.adapter;

/** Build an axios-shaped adapter that resolves `data`. */
function okAdapter(data) {
    return vi.fn(async (config) => ({
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
    }));
}

/** Build an axios-shaped adapter that rejects with `errorLike`. */
function failAdapter(errorLike) {
    return vi.fn(async () => {
        throw errorLike;
    });
}

afterEach(() => {
    api.defaults.adapter = ORIGINAL_ADAPTER;
    window.localStorage.clear();
    vi.restoreAllMocks();
});

describe('getBaseUrl', () => {
    it('defaults to the orchestrate gateway when nothing is saved', () => {
        expect(getBaseUrl()).toBe('/api/orchestrate');
    });

    it('builds an ip:port base in ip mode', () => {
        window.localStorage.setItem(
            'server_config',
            JSON.stringify({ mode: 'ip', ip: '10.1.2.3', port: '7000' })
        );
        // jsdom serves the test page over http:, so the protocol is http://.
        expect(getBaseUrl()).toBe('http://10.1.2.3:7000');
    });

    it('falls back to the default ip/port in ip mode when unset', () => {
        window.localStorage.setItem(
            'server_config',
            JSON.stringify({ mode: 'ip' })
        );
        expect(getBaseUrl()).toBe('http://127.0.0.1:5001');
    });

    it('prefers nginxUrl and trims a trailing slash', () => {
        window.localStorage.setItem(
            'server_config',
            JSON.stringify({
                mode: 'nginx',
                nginxUrl: 'https://an.example.com/gateway/',
                gatewayUrl: '/ignored',
            })
        );
        expect(getBaseUrl()).toBe('https://an.example.com/gateway');
    });

    it('falls back to gatewayUrl when nginxUrl is absent', () => {
        window.localStorage.setItem(
            'server_config',
            JSON.stringify({ gatewayUrl: '/custom-gw/' })
        );
        expect(getBaseUrl()).toBe('/custom-gw');
    });

    it('falls back to the default gateway when neither URL is set', () => {
        window.localStorage.setItem(
            'server_config',
            JSON.stringify({ mode: 'anything-else' })
        );
        expect(getBaseUrl()).toBe('/api/orchestrate');
    });

    it('falls back to the default ip endpoint when the saved config is invalid JSON', () => {
        window.localStorage.setItem('server_config', '{not valid json');
        expect(getBaseUrl()).toBe('http://127.0.0.1:5001');
    });
});

describe('shared api instance interceptors', () => {
    it('unwraps response.data on success', async () => {
        const envelope = { code: 0, message: 'ok', data: { hello: 'world' } };
        api.defaults.adapter = okAdapter(envelope);
        const result = await api.get('/anything');
        expect(result).toEqual(envelope);
        expect(api.defaults.adapter).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/anything' })
        );
    });

    it('dispatches "auth-expired" on a 401 and rejects', async () => {
        const onExpired = vi.fn();
        window.addEventListener('auth-expired', onExpired);
        api.defaults.adapter = failAdapter({ response: { status: 401 } });

        await expect(api.get('/secure')).rejects.toMatchObject({
            response: { status: 401 },
        });
        expect(onExpired).toHaveBeenCalledTimes(1);
        window.removeEventListener('auth-expired', onExpired);
    });

    it('does not dispatch "auth-expired" for non-401 HTTP errors', async () => {
        const onExpired = vi.fn();
        window.addEventListener('auth-expired', onExpired);
        api.defaults.adapter = failAdapter({ response: { status: 500 } });

        await expect(api.get('/boom')).rejects.toMatchObject({
            response: { status: 500 },
        });
        expect(onExpired).not.toHaveBeenCalled();
        window.removeEventListener('auth-expired', onExpired);
    });

    it('rejects network errors (no response) without an auth-expired event', async () => {
        const onExpired = vi.fn();
        window.addEventListener('auth-expired', onExpired);
        api.defaults.adapter = failAdapter(new Error('Network Error'));

        await expect(api.get('/unreachable')).rejects.toThrow('Network Error');
        expect(onExpired).not.toHaveBeenCalled();
        window.removeEventListener('auth-expired', onExpired);
    });
});

describe('createApi', () => {
    it('creates an instance with the trimmed gateway as baseURL', () => {
        expect(createApi('/plugins/registry/api/').defaults.baseURL).toBe(
            '/plugins/registry/api'
        );
    });

    it('defaults the gateway to /api/orchestrate', () => {
        expect(createApi().defaults.baseURL).toBe('/api/orchestrate');
        expect(createApi('').defaults.baseURL).toBe('/api/orchestrate');
    });

    it('keeps absolute remote gateways intact (trailing slash trimmed)', () => {
        expect(createApi('http://10.0.0.9:6000/x/').defaults.baseURL).toBe(
            'http://10.0.0.9:6000/x'
        );
    });

    it('each instance is independent from the default api', () => {
        const inst = createApi('/gw');
        expect(inst).not.toBe(api);
        expect(inst.interceptors.response.handlers.length).toBeGreaterThan(0);
    });

    it('unwraps response.data on success', async () => {
        const inst = createApi('/gw');
        inst.defaults.adapter = okAdapter('payload');
        await expect(inst.get('/x')).resolves.toBe('payload');
    });

    it('dispatches "auth-expired" on a 401 and rejects', async () => {
        const inst = createApi('/gw');
        inst.defaults.adapter = failAdapter({ response: { status: 401 } });
        const onExpired = vi.fn();
        window.addEventListener('auth-expired', onExpired);

        await expect(inst.get('/x')).rejects.toMatchObject({
            response: { status: 401 },
        });
        expect(onExpired).toHaveBeenCalledTimes(1);
        window.removeEventListener('auth-expired', onExpired);
    });
});

describe('auth endpoints', () => {
    // localStorage is empty in every test (cleared in afterEach), so the
    // orchestrate base resolves to the default gateway.
    const BASE = '/api/orchestrate/rest/v1/orchestrate';

    it('authCheck GETs /auth/check and returns the envelope payload', async () => {
        const spy = vi
            .spyOn(api, 'get')
            .mockResolvedValue({ data: { auth_required: false, username: 'admin' } });
        const out = await authCheck();
        expect(spy).toHaveBeenCalledWith(`${BASE}/auth/check`);
        expect(out).toEqual({ auth_required: false, username: 'admin' });
    });

    it('login POSTs credentials and returns the envelope payload', async () => {
        const spy = vi
            .spyOn(api, 'post')
            .mockResolvedValue({ data: { ok: true } });
        const out = await login('admin', 'secret');
        expect(spy).toHaveBeenCalledWith(`${BASE}/auth/login`, {
            username: 'admin',
            password: 'secret',
        });
        expect(out).toEqual({ ok: true });
    });

    it('logout POSTs /auth/logout', async () => {
        const spy = vi.spyOn(api, 'post').mockResolvedValue({});
        await logout();
        expect(spy).toHaveBeenCalledWith(`${BASE}/auth/logout`);
    });
});

describe('stream URL builders', () => {
    const BASE = '/api/orchestrate/rest/v1/orchestrate';

    it('getStartProcessStreamUrl builds the minimal execute URL', () => {
        expect(getStartProcessStreamUrl('psop-1')).toBe(
            `${BASE}/execute?psop_id=psop-1`
        );
    });

    it('getStartProcessStreamUrl appends optional params with & separators', () => {
        expect(
            getStartProcessStreamUrl('psop-1', 'fix the bug', 'zh', 'coder-agent')
        ).toBe(
            `${BASE}/execute?psop_id=psop-1&user_intent=fix%20the%20bug&lang=zh&target_agent=coder-agent`
        );
    });

    it('getStartProcessStreamUrl omits empty optional params', () => {
        expect(getStartProcessStreamUrl('p', '', 'en', '')).toBe(
            `${BASE}/execute?psop_id=p&lang=en`
        );
    });

    it('getDispatchStreamUrl builds intent + agent_name params', () => {
        expect(getDispatchStreamUrl('deploy app', 'agent/1', 'zh')).toBe(
            `${BASE}/dispatch?intent=deploy%20app&agent_name=agent%2F1&lang=zh`
        );
    });

    it('getDispatchStreamUrl omits lang when not provided', () => {
        expect(getDispatchStreamUrl('intent', 'agent')).toBe(
            `${BASE}/dispatch?intent=intent&agent_name=agent`
        );
    });
});

describe('envelope unwrapping (parsePdf / handlePlan / generateWorkflowFromIntent)', () => {
    const BASE = '/api/orchestrate/rest/v1/orchestrate';

    it('parsePdf posts FormData and returns body.data on success', async () => {
        const spy = vi
            .spyOn(api, 'post')
            .mockResolvedValue({ status: 'ok', data: { pages: 3 } });
        const file = new File(['%PDF-1.4'], 'doc.pdf', {
            type: 'application/pdf',
        });

        const out = await parsePdf(file);

        expect(out).toEqual({ pages: 3 });
        expect(spy).toHaveBeenCalledTimes(1);
        const [url, body] = spy.mock.calls[0];
        expect(url).toBe(`${BASE}/parse-pdf`);
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('file')).toBe(file);
    });

    it('parsePdf throws the server message on error status', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({
            status: 'error',
            message: 'pdf too large',
        });
        await expect(
            parsePdf(new File([], 'x.pdf'))
        ).rejects.toThrow('pdf too large');
    });

    it('handlePlan posts preflow + agent cards and unwraps data', async () => {
        const spy = vi
            .spyOn(api, 'post')
            .mockResolvedValue({ status: 'ok', data: { plan: [] } });

        const out = await handlePlan({ nodes: [1] }, [{ id: 'a1' }]);

        expect(spy).toHaveBeenCalledWith(`${BASE}/generate-from-preflow`, {
            preflow: { nodes: [1] },
            agent_cards: [{ id: 'a1' }],
        });
        expect(out).toEqual({ plan: [] });
    });

    it('handlePlan throws a generic message when the envelope has none', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({ status: 'error' });
        await expect(handlePlan({}, [])).rejects.toThrow('Request failed');
    });

    it('generateWorkflowFromIntent sends intent + name and unwraps data', async () => {
        const spy = vi
            .spyOn(api, 'post')
            .mockResolvedValue({ status: 'ok', data: { workflow: {} } });

        const out = await generateWorkflowFromIntent('build a website', 'My WF');

        expect(spy).toHaveBeenCalledWith(`${BASE}/generate-from-intent`, {
            user_intent: 'build a website',
            workflow_name: 'My WF',
        });
        expect(out).toEqual({ workflow: {} });
    });

    it('generateWorkflowFromIntent falls back to the whole body when data is empty', async () => {
        const body = { status: 'ok', message: 'generated' };
        vi.spyOn(api, 'post').mockResolvedValue(body);
        const out = await generateWorkflowFromIntent('intent');
        expect(out).toBe(body);
    });
});

describe('matchWorkflowsTopN', () => {
    const BASE = '/api/orchestrate/rest/v1/orchestrate';

    it('returns [] when body.data is empty', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({ data: null });
        expect(await matchWorkflowsTopN('intent')).toEqual([]);
    });

    it('wraps a single object into an array with mapped fields', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({
            data: {
                workflow_id: 'w1',
                name: 'Workflow One',
                description: 'desc',
                score: 0.9,
            },
        });

        expect(await matchWorkflowsTopN('intent')).toEqual([
            {
                workflow_id: 'w1',
                name: 'Workflow One',
                description: 'desc',
                tags: [],
                score: 0.9,
            },
        ]);
    });

    it('maps arrays and defaults tags to []', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({
            data: [
                { workflow_id: 'a', name: 'A', tags: ['x'] },
                { workflow_id: 'b', name: 'B' },
            ],
        });

        const out = await matchWorkflowsTopN('intent', 5);

        expect(out).toEqual([
            { workflow_id: 'a', name: 'A', tags: ['x'] },
            { workflow_id: 'b', name: 'B', tags: [] },
        ]);
    });

    it('posts the intent and top_n to the retrieve endpoint', async () => {
        const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: null });

        await matchWorkflowsTopN('find flows', 7);

        expect(spy).toHaveBeenCalledWith(`${BASE}/retrieve-topn-by-intent`, {
            user_intent: 'find flows',
            top_n: 7,
        });
    });
});
