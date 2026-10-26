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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    PluginRegistryProvider,
    usePluginRegistry,
} from '../../src/plugin/registry.jsx';

/** Probe echoing the registry contents into the DOM. */
function RegistryProbe() {
    const plugins = usePluginRegistry();
    return (
        <div data-testid="registry">{plugins.map((p) => p.id).join(',')}</div>
    );
}

describe('usePluginRegistry', () => {
    it('defaults to an empty list outside a provider', () => {
        render(<RegistryProbe />);
        expect(screen.getByTestId('registry')).toHaveTextContent('');
    });

    it('returns the plugins array provided by the PluginRegistryProvider', () => {
        render(
            <PluginRegistryProvider plugins={[{ id: 'alpha' }, { id: 'beta' }]}>
                <RegistryProbe />
            </PluginRegistryProvider>
        );
        expect(screen.getByTestId('registry')).toHaveTextContent('alpha,beta');
    });

    it('passes the exact plugins reference through (no copying)', () => {
        const plugins = [{ id: 'only' }];
        // Identity comparison rendered into the DOM — no render side effects.
        function ReferenceProbe({ expected }) {
            const received = usePluginRegistry();
            return (
                <div data-testid="reference">
                    {received === expected ? 'same' : 'copy'}
                </div>
            );
        }
        render(
            <PluginRegistryProvider plugins={plugins}>
                <ReferenceProbe expected={plugins} />
            </PluginRegistryProvider>
        );
        expect(screen.getByTestId('reference')).toHaveTextContent('same');
    });
});

describe('PluginRegistryProvider', () => {
    it('renders its children', () => {
        render(
            <PluginRegistryProvider plugins={[]}>
                <div data-testid="child">content</div>
            </PluginRegistryProvider>
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });
});
