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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '../../src/components/error_boundary/index.jsx';

/**
 * Flaky child — throws while `shouldThrow` is set, recovers afterwards.
 * The "break" button lets a test make it throw again after recovery.
 */
let shouldThrow = false;
function FlakyChild() {
    const [broken, setBroken] = useState(false);
    if (shouldThrow || broken) {
        throw new Error('plugin exploded');
    }
    return (
        <div>
            <div data-testid="child-ok">Child OK</div>
            <button onClick={() => setBroken(true)}>break</button>
        </div>
    );
}

/** Child that throws an Error with no message. */
function SilentThrowChild() {
    throw new Error();
}

/**
 * Silence the expected console noise from React + componentDidCatch.
 */
function mockConsoleError() {
    return vi.spyOn(console, 'error').mockImplementation(() => {});
}

/**
 * Suppress jsdom's "Uncaught [Error: …]" stderr reporting for render-phase
 * errors that the boundary is expected to catch. jsdom reports listener
 * exceptions through a CANCELABLE window "error" event — preventDefault()
 * marks the error as handled so no jsdomError is emitted.
 */
function suppressJsdomErrorReporting() {
    const handler = (event) => event.preventDefault();
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
}

/** Install both noise guards for a test that renders a throwing child. */
function silenceExpectedErrorNoise() {
    const restoreReporting = suppressJsdomErrorReporting();
    const consoleSpy = mockConsoleError();
    return () => {
        consoleSpy.mockRestore();
        restoreReporting();
    };
}

describe('ErrorBoundary', () => {
    it('renders children when nothing throws', () => {
        render(
            <ErrorBoundary>
                <FlakyChild />
            </ErrorBoundary>
        );
        expect(screen.getByTestId('child-ok')).toBeInTheDocument();
        expect(screen.queryByText('Plugin Error')).not.toBeInTheDocument();
    });

    it('shows the fallback UI with the error message when a child throws', () => {
        const restore = silenceExpectedErrorNoise();
        shouldThrow = true;
        try {
            render(
                <ErrorBoundary>
                    <FlakyChild />
                </ErrorBoundary>
            );
            expect(screen.getByText('Plugin Error')).toBeInTheDocument();
            expect(screen.getByText('plugin exploded')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Retry' })
            ).toBeInTheDocument();
            // Children are replaced by the fallback.
            expect(screen.queryByTestId('child-ok')).not.toBeInTheDocument();
        } finally {
            shouldThrow = false;
            restore();
        }
    });

    it('falls back to a generic message when the error carries no message', () => {
        const restore = silenceExpectedErrorNoise();
        try {
            render(
                <ErrorBoundary>
                    <SilentThrowChild />
                </ErrorBoundary>
            );
            expect(screen.getByText('Plugin Error')).toBeInTheDocument();
            expect(
                screen.getByText('An unexpected error occurred in this plugin.')
            ).toBeInTheDocument();
        } finally {
            restore();
        }
    });

    it('recovers via the Retry button once the child stops throwing', async () => {
        const restore = silenceExpectedErrorNoise();
        shouldThrow = true;
        try {
            const user = userEvent.setup();
            render(
                <ErrorBoundary>
                    <FlakyChild />
                </ErrorBoundary>
            );
            expect(screen.getByText('Plugin Error')).toBeInTheDocument();

            // The failure is transient — the child renders fine again.
            shouldThrow = false;
            await user.click(screen.getByRole('button', { name: 'Retry' }));

            expect(screen.getByTestId('child-ok')).toBeInTheDocument();
            expect(screen.queryByText('Plugin Error')).not.toBeInTheDocument();
        } finally {
            shouldThrow = false;
            restore();
        }
    });

    it('returns to the fallback if the child throws again after Retry', async () => {
        const restore = silenceExpectedErrorNoise();
        shouldThrow = true;
        try {
            const user = userEvent.setup();
            render(
                <ErrorBoundary>
                    <FlakyChild />
                </ErrorBoundary>
            );
            shouldThrow = false;
            await user.click(screen.getByRole('button', { name: 'Retry' }));
            expect(screen.getByTestId('child-ok')).toBeInTheDocument();

            // Break the child again — the boundary must catch it once more.
            await user.click(screen.getByRole('button', { name: 'break' }));
            expect(screen.getByText('Plugin Error')).toBeInTheDocument();
            expect(screen.getByText('plugin exploded')).toBeInTheDocument();
        } finally {
            shouldThrow = false;
            restore();
        }
    });
});

afterEach(() => {
    shouldThrow = false;
});
