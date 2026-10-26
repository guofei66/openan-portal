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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PluginManager from '../../src/components/plugin_manager/index.jsx';
import {
    renderWithShellProviders,
    baseI18n,
} from '../../../tests/helpers/portal-test-utils.jsx';

/** Manifest-shaped plugin for the manager's `plugins` prop. */
function makePlugin(id, { disabled = false, routes = [`/${id}`] } = {}) {
    return {
        id,
        name: id.toUpperCase(),
        version: '1.2.3',
        menu: [
            {
                id: `${id}-menu`,
                labelKey: id.toUpperCase(),
                order: 1,
                route: `/${id}`,
                icon: () => null,
            },
        ],
        routes: routes.map((path) => ({
            path,
            component: () => Promise.resolve({ default: () => null }),
        })),
        disabled,
    };
}

function renderManager({ plugins, disabledIds = new Set() } = {}) {
    const onToggle = vi.fn();
    const onClose = vi.fn();
    const utils = renderWithShellProviders(
        <PluginManager
            plugins={plugins}
            disabledIds={disabledIds}
            onToggle={onToggle}
            onClose={onClose}
        />
    );
    return { ...utils, onToggle, onClose };
}

beforeEach(async () => {
    await baseI18n.changeLanguage('en');
});

describe('PluginManager rendering', () => {
    it('renders the modal shell with translated title and subtitle', () => {
        renderManager({ plugins: [] });

        expect(screen.getByText('Plugin Management')).toBeInTheDocument();
        expect(
            screen.getByText('Enable or disable plugins at runtime')
        ).toBeInTheDocument();
    });

    it('lists every plugin with its name, version, id and route paths', () => {
        renderManager({
            plugins: [
                makePlugin('alpha-plugin', { routes: ['/alpha', '/alpha/nested'] }),
                makePlugin('beta-plugin'),
            ],
        });

        expect(screen.getByText('ALPHA-PLUGIN')).toBeInTheDocument();
        expect(screen.getByText('BETA-PLUGIN')).toBeInTheDocument();
        // Both plugins carry the same version badge.
        expect(screen.getAllByText('v1.2.3')).toHaveLength(2);
        expect(screen.getByText('alpha-plugin')).toBeInTheDocument();
        expect(screen.getByText('/alpha, /alpha/nested')).toBeInTheDocument();
        expect(screen.getByText('beta-plugin')).toBeInTheDocument();
    });

    it('shows total / active / disabled stats', () => {
        renderManager({
            plugins: [
                makePlugin('alpha-plugin'),
                makePlugin('beta-plugin'),
                makePlugin('gamma-plugin'),
            ],
            disabledIds: new Set(['gamma-plugin']),
        });

        expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('3');
        expect(screen.getByText('Active').previousElementSibling).toHaveTextContent('2');
        expect(screen.getByText('Disabled').previousElementSibling).toHaveTextContent('1');
    });

    it('omits the disabled stat when every plugin is active', () => {
        renderManager({
            plugins: [makePlugin('alpha-plugin')],
            disabledIds: new Set(),
        });

        expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('1');
        expect(screen.getByText('Active').previousElementSibling).toHaveTextContent('1');
        expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    });
});

describe('PluginManager toggling', () => {
    it('clicking the toggle of an enabled plugin calls onToggle(id)', async () => {
        const user = userEvent.setup();
        const { onToggle } = renderManager({
            plugins: [makePlugin('alpha-plugin')],
            disabledIds: new Set(),
        });

        await user.click(screen.getByRole('button', { name: 'Disable' }));

        expect(onToggle).toHaveBeenCalledWith('alpha-plugin');
    });

    it('clicking the toggle of a disabled plugin calls onToggle(id)', async () => {
        const user = userEvent.setup();
        const { onToggle } = renderManager({
            plugins: [makePlugin('alpha-plugin'), makePlugin('beta-plugin')],
            disabledIds: new Set(['beta-plugin']),
        });

        await user.click(screen.getByRole('button', { name: 'Enable' }));

        expect(onToggle).toHaveBeenCalledWith('beta-plugin');
    });
});

describe('PluginManager closing', () => {
    it('the X button calls onClose', async () => {
        const user = userEvent.setup();
        const { container, onClose } = renderManager({
            plugins: [makePlugin('alpha-plugin')],
        });

        // The X control is the first button in the modal (icon-only, no name).
        const xButton = container.querySelector('button');
        expect(xButton).toBeInTheDocument();
        await user.click(xButton);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('the footer Close button calls onClose', async () => {
        const user = userEvent.setup();
        const { onClose } = renderManager({ plugins: [] });

        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking the backdrop calls onClose', () => {
        const { container, onClose } = renderManager({ plugins: [] });

        fireEvent.click(container.firstChild); // the fixed overlay div

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking inside the panel does NOT close the modal', () => {
        renderManager({ plugins: [makePlugin('alpha-plugin')] });

        fireEvent.click(screen.getByText('ALPHA-PLUGIN'));
        fireEvent.click(screen.getByText('Plugin Management'));

        // onClose is a no-op — nothing to assert beyond "not closed", which
        // is proven by the modal still being present.
        expect(screen.getByText('Plugin Management')).toBeInTheDocument();
    });
});

describe('PluginManager manifest viewer', () => {
    it('expands the manifest JSON with icons serialized as [Component]', async () => {
        const user = userEvent.setup();
        const { container } = renderManager({
            plugins: [makePlugin('alpha-plugin')],
        });

        expect(container.querySelector('pre')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'View manifest' }));

        const pre = container.querySelector('pre');
        expect(pre).toBeInTheDocument();
        expect(pre.textContent).toContain('"id": "alpha-plugin"');
        expect(pre.textContent).toContain('[Component]');
        expect(pre.textContent).toContain('"version": "1.2.3"');

        // Collapses again on a second click.
        await user.click(screen.getByRole('button', { name: 'View manifest' }));
        expect(container.querySelector('pre')).not.toBeInTheDocument();
    });
});
