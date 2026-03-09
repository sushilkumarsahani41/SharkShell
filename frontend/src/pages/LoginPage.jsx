import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, setupStatus } = useAuth();
    const navigate = useNavigate();

    if (setupStatus?.requireSetup) {
        return <Navigate to="/register" replace />;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await login(email, password);
            navigate('/dashboard');
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
                    <p className="auth-subtitle">Sign in to your account</p>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && <div className="auth-error">{error}</div>}
                        <div className="input-group">
                            <label>Email</label>
                            <input type="email" className="input-field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input type="password" className="input-field" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={isLoading}>
                            {isLoading ? <span className="spinner" /> : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
