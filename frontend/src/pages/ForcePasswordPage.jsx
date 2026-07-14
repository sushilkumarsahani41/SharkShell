import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Shown instead of the dashboard when an admin-created account signs in
// with a temporary password (must_change_password = true).
export default function ForcePasswordPage() {
    const { user, changePassword, logout } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }
        setIsLoading(true);
        try {
            await changePassword(currentPassword, password);
            // refreshUser inside changePassword clears must_change_password → app re-renders into the dashboard
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
                    <p className="auth-subtitle">Welcome{user?.name ? `, ${user.name}` : ''} — set a new password to continue</p>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && <div className="auth-error">{error}</div>}
                        <div className="input-group">
                            <label>Temporary password</label>
                            <input type="password" className="input-field" placeholder="The password you signed in with" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
                        </div>
                        <div className="input-group">
                            <label>New password</label>
                            <input type="password" className="input-field" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                        </div>
                        <div className="input-group">
                            <label>Confirm new password</label>
                            <input type="password" className="input-field" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={isLoading}>
                            {isLoading ? <span className="spinner" /> : 'Set password & continue'}
                        </button>
                        <p className="auth-switch"><a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a></p>
                    </form>
                </div>
            </div>
        </div>
    );
}
