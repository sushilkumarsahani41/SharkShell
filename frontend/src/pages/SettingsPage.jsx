import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
    const { user } = useAuth();

    return (
        <div>
            <div className="page-header">
                <div><h1>Settings</h1><p>Account &amp; workspace preferences</p></div>
            </div>

            <div className="settings-section glass-card">
                <div className="settings-section-header">
                    <div className="settings-section-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <div>
                        <h2>Account</h2>
                        <p>Your SharkShell profile.</p>
                    </div>
                </div>
                <div className="settings-field-list">
                    <div className="settings-field"><span className="settings-field-label">Name</span><span>{user?.name || '—'}</span></div>
                    <div className="settings-field"><span className="settings-field-label">Email</span><span>{user?.email || '—'}</span></div>
                    {user?.created_at && (
                        <div className="settings-field"><span className="settings-field-label">Member since</span><span>{new Date(user.created_at).toLocaleDateString()}</span></div>
                    )}
                </div>
            </div>
        </div>
    );
}
