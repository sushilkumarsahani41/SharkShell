import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiUrl } from '../api';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/auth/reset-password'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            navigate('/login', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-bg">
                <div className="auth-orb auth-orb-1" />
                <div className="auth-orb auth-orb-2" />
                <div className="auth-orb auth-orb-3" />
            </div>

            <div className="auth-container">
                <div className="auth-card glass-card">
                    <div className="auth-logo">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <defs>
                                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <h1>SharkShell</h1>
                    </div>
                    <p className="auth-subtitle">Choose a new password</p>

                    {!token ? (
                        <div className="auth-form">
                            <div className="auth-error">This reset link is missing its token. Use the link from your email.</div>
                            <p className="auth-switch"><Link to="/forgot-password">Request a new link</Link></p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="auth-form">
                            {error && <div className="auth-error">{error}</div>}
                            <div className="input-group">
                                <label>New password</label>
                                <input type="password" className="input-field" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
                            </div>
                            <div className="input-group">
                                <label>Confirm password</label>
                                <input type="password" className="input-field" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={isLoading}>
                                {isLoading ? <span className="spinner" /> : 'Reset password'}
                            </button>
                            <p className="auth-switch">Back to <Link to="/login">Sign in</Link></p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
