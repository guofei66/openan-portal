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

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, {
    authCheck,
    login as apiLogin,
    logout as apiLogout,
    changePassword as apiChangePassword,
} from '../service/api.js';

const AuthContext = createContext(null);

/** sessionStorage key marking an explicit "browse as guest" opt-in. */
const GUEST_ENTRY_KEY = 'openan-guest-entry';

/**
 * Auth states:
 *   - 'checking'        initial state while authCheck() is in flight
 *   - 'authenticated'   a valid session (or auth disabled server-side)
 *   - 'guest'           no session, but the visitor chose guest browsing on
 *                       the login card (and the server allows it)
 *   - 'must-change'     logged in with must_change_password pending; the
 *                       portal blocks everything until the password is changed
 *   - 'unauthenticated' no session → login screen (default for visitors)
 */
export function AuthProvider({ children }) {
    const [authState, setAuthState] = useState('checking');
    const [authRequired, setAuthRequired] = useState(false);
    const [guestAllowed, setGuestAllowed] = useState(false);
    const [registrationEnabled, setRegistrationEnabled] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentRole, setCurrentRole] = useState(null);
    const [passwordChanged, setPasswordChanged] = useState(false);

    /** Drop the identity and return to the login screen. */
    const clearIdentity = useCallback(() => {
        sessionStorage.removeItem(GUEST_ENTRY_KEY);
        setCurrentUser(null);
        setCurrentRole(null);
        setAuthState('unauthenticated');
    }, []);

    /** Fold one auth/check payload into context state. */
    const applyCheck = useCallback((data) => {
        const required = data.auth_required !== false;
        setAuthRequired(required);
        setGuestAllowed(Boolean(data.guest_allowed));
        setRegistrationEnabled(Boolean(data.registration_enabled));
        if (!required || data.authenticated === true) {
            setCurrentUser(data.username || null);
            setCurrentRole(data.role || null);
            setAuthState(
                data.must_change_password ? 'must-change' : 'authenticated'
            );
        } else if (data.guest_allowed && sessionStorage.getItem(GUEST_ENTRY_KEY) === '1') {
            // Guest browsing is an explicit per-visit choice made on the
            // login card; it survives reloads but not logins or logouts.
            setCurrentUser(null);
            setCurrentRole('guest');
            setAuthState('guest');
        } else {
            setCurrentUser(null);
            setCurrentRole(null);
            setAuthState('unauthenticated');
        }
    }, []);

    const checkAuth = useCallback(async () => {
        try {
            applyCheck(await authCheck());
        } catch {
            setAuthState('unauthenticated');
        }
    }, [applyCheck]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Listen for auth events dispatched by the axios interceptor:
    //  - 'auth-expired': an expired session returns to the login screen
    //    (login is required by default; guest browsing is an explicit choice)
    //  - 'auth-password-change-required': a 403 with must_change_password
    //    (e.g. a restored stale session) re-enters the forced change flow
    useEffect(() => {
        const handleExpired = clearIdentity;
        const handlePasswordChange = () => setAuthState('must-change');
        window.addEventListener('auth-expired', handleExpired);
        window.addEventListener('auth-password-change-required', handlePasswordChange);
        return () => {
            window.removeEventListener('auth-expired', handleExpired);
            window.removeEventListener('auth-password-change-required', handlePasswordChange);
        };
    }, [clearIdentity]);

    /** Explicit guest entry from the login card ("browse as guest"). */
    const enterAsGuest = useCallback(() => {
        sessionStorage.setItem(GUEST_ENTRY_KEY, '1');
        setCurrentUser(null);
        setCurrentRole('guest');
        setAuthState('guest');
    }, []);

    const login = useCallback(async (username, password) => {
        const data = await apiLogin(username, password);
        sessionStorage.removeItem(GUEST_ENTRY_KEY);
        setAuthRequired(true);
        setCurrentUser(data.username || username);
        setCurrentRole(data.role || 'user');
        setPasswordChanged(false);
        setAuthState(data.must_change_password ? 'must-change' : 'authenticated');
        return data;
    }, []);

    /**
     * Change the signed-in user's password. The backend revokes every session
     * of the user afterwards; the app returns to the login card with a
     * "please sign in again" notice.
     */
    const changePassword = useCallback(async (oldPassword, newPassword) => {
        await apiChangePassword(oldPassword, newPassword);
        clearIdentity();
        setPasswordChanged(true);
    }, [clearIdentity]);

    // Used by the ChangePassword screens: the backend revoked the session, so
    // the next login uses the new password.
    const completePasswordChange = useCallback(() => {
        clearIdentity();
        setPasswordChanged(true);
    }, [clearIdentity]);

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            clearIdentity();
        }
    }, [clearIdentity]);

    const value = {
        authState,
        authRequired,
        guestAllowed,
        registrationEnabled,
        currentUser,
        currentRole,
        passwordChanged,
        mustChangePassword: authState === 'must-change',
        needsPasswordChange: authState === 'must-change',
        isAuthenticated: authState === 'authenticated',
        isChecking: authState === 'checking',
        isGuest: authState === 'guest',
        isAdmin: authState === 'authenticated' && currentRole === 'admin',
        enterAsGuest,
        login,
        logout,
        checkAuth,
        applyCheck,
        changePassword,
        completePasswordChange,
        api,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth() must be used within an <AuthProvider>');
    }
    return ctx;
}
