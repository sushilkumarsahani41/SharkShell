import { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const [setupStatus, setSetupStatus] = useState({ requireSetup: false });
    const [loadingSetup, setLoadingSetup] = useState(true);

    useEffect(() => {
        async function fetchInitialState() {
            try {
                const setupRes = await fetch(apiUrl('/api/auth/setup-status'));
                if (setupRes.ok) {
                    const data = await setupRes.json();
                    setSetupStatus(data);
                }
            } catch (err) {
                console.error('Failed to fetch setup status', err);
            } finally {
                setLoadingSetup(false);
            }

            const savedToken = localStorage.getItem('token');
            if (savedToken) {
                setToken(savedToken);
                await fetchUser(savedToken);
            } else {
                setLoading(false);
            }
        }

        fetchInitialState();
    }, []);

    async function fetchUser(t) {
        try {
            const res = await fetch(apiUrl('/api/auth/me'), {
                headers: { Authorization: `Bearer ${t}` },
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                localStorage.removeItem('token');
                setToken(null);
            }
        } catch {
            localStorage.removeItem('token');
            setToken(null);
        } finally {
            setLoading(false);
        }
    }

    async function login(email, password) {
        const res = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }

    async function register(name, email, password) {
        const res = await fetch(apiUrl('/api/auth/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }

    async function logout() {
        await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, token, loading, setupStatus, loadingSetup, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
