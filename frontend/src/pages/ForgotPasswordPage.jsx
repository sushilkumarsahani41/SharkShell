import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../api';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/auth/forgot-password'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMessage(data.message);
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
                    <p className="auth-subtitle">Reset your password</p>

                    {message ? (
                        <div className="auth-form">
                            <div className="auth-success">{message}</div>
                            <Link to="/login" className="btn btn-primary btn-lg" style={{ width: '100%', textAlign: 'center' }}>Back to sign in</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="auth-form">
                            {error && <div className="auth-error">{error}</div>}
                            <div className="input-group">
                                <label>Email</label>
                                <input type="email" className="input-field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                            </div>
                            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={isLoading}>
                                {isLoading ? <span className="spinner" /> : 'Send reset link'}
                            </button>
                            <p className="auth-switch">Remembered it? <Link to="/login">Sign in</Link></p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
