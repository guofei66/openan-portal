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
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext.jsx';

/** Probe exposing the theme context value through the DOM. */
function ThemeProbe() {
    const { isDark, toggle, setDark } = useTheme();
    return (
        <div>
            <span data-testid="is-dark">{String(isDark)}</span>
            <button onClick={toggle}>toggle</button>
            <button onClick={() => setDark(false)}>set-light</button>
        </div>
    );
}

function renderTheme() {
    return render(
        <ThemeProvider>
            <ThemeProbe />
        </ThemeProvider>
    );
}

describe('ThemeProvider', () => {
    it('defaults to dark when nothing is saved in localStorage', () => {
        renderTheme();
        expect(screen.getByTestId('is-dark')).toHaveTextContent('true');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
        expect(window.localStorage.getItem('theme')).toBe('dark');
    });

    it('restores the light theme from localStorage', () => {
        window.localStorage.setItem('theme', 'light');
        renderTheme();
        expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
        expect(window.localStorage.getItem('theme')).toBe('light');
    });

    it('restores the dark theme from localStorage', () => {
        window.localStorage.setItem('theme', 'dark');
        renderTheme();
        expect(screen.getByTestId('is-dark')).toHaveTextContent('true');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('toggle() flips dark → light → dark and persists each choice', async () => {
        const user = userEvent.setup();
        renderTheme();

        await user.click(screen.getByRole('button', { name: 'toggle' }));
        expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
        expect(window.localStorage.getItem('theme')).toBe('light');

        await user.click(screen.getByRole('button', { name: 'toggle' }));
        expect(screen.getByTestId('is-dark')).toHaveTextContent('true');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(window.localStorage.getItem('theme')).toBe('dark');
    });

    it('setDark(false) explicitly switches to light', async () => {
        const user = userEvent.setup();
        renderTheme();

        await user.click(screen.getByRole('button', { name: 'set-light' }));
        expect(screen.getByTestId('is-dark')).toHaveTextContent('false');
        expect(document.documentElement.style.colorScheme).toBe('light');
        expect(window.localStorage.getItem('theme')).toBe('light');
    });
});

describe('useTheme', () => {
    it('throws when used outside a <ThemeProvider>', () => {
        // SSR render: the hook only uses useContext, and renderToString throws
        // synchronously without React's guarded-callback machinery (which
        // jsdom reports as "uncaught" noise in DOM tests).
        expect(() => renderToString(<ThemeProbe />)).toThrow(
            /useTheme\(\) must be used within a <ThemeProvider>/
        );
    });
});
