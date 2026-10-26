// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import * as sdk from '../src/index.js';

describe('@openan/portal-sdk public API', () => {
    it('exports the documented surface', () => {
        expect(sdk.PortalContext).toBeDefined();
        expect(sdk.usePortalContext).toBeTypeOf('function');
        expect(sdk.PortalProvider).toBeTypeOf('function');
        expect(sdk.validateManifest).toBeTypeOf('function');
        expect(sdk.loadEnabledPlugins).toBeTypeOf('function');
    });
});
