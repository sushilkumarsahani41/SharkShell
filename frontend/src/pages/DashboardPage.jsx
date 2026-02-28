import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTerminal } from '../context/TerminalContext';
import { apiUrl } from '../api';

export default function DashboardPage() {
    const { user, token } = useAuth();
    const { createSession } = useTerminal();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ keys: 0, hosts: 0 });
    const [hosts, setHosts] = useState([]);
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) fetchDashboardData();
    }, [token]);

    async function fetchDashboardData() {
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [keysRes, hostsRes] = await Promise.all([
                fetch(apiUrl('/api/keys'), { headers }),
                fetch(apiUrl('/api/hosts'), { headers }),
            ]);
            const keysData = keysRes.ok ? await keysRes.json() : { keys: [] };
            const hostsData = hostsRes.ok ? await hostsRes.json() : { hosts: [] };
            const k = keysData.keys || [];
            const h = hostsData.hosts || [];
            setKeys(k);
            setHosts(h);
            setStats({ keys: k.length, hosts: h.length });
        } catch { } finally {
            setLoading(false);
        }
    }

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }

    const authTypeCounts = hosts.reduce((acc, h) => {
        acc[h.auth_type] = (acc[h.auth_type] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="dashboard-home">
            {/* Hero Section */}
            <div className="hero-section">
                <div className="hero-content">
                    <div className="hero-greeting">
                        <h1>{getGreeting()}, <span className="hero-name">{user?.name?.split(' ')[0]}</span></h1>
                        <p className="hero-subtitle">Here's your SharkShell overview</p>
                    </div>
                    <div className="hero-time">
                        <span className="hero-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                    </div>
                </div>
                <div className="hero-glow" />
            </div>

            {/* Stat Cards */}
            <div className="stat-row">
                <a href="/dashboard/keys" className="stat-card glass-card stat-keys" onClick={(e) => { e.preventDefault(); navigate('/dashboard/keys'); }}>
                    <div className="stat-card-inner">
                        <div className="stat-icon-wrap">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                            </svg>
                        </div>
                        <div className="stat-text">
                            <span className="stat-number">{loading ? '—' : stats.keys}</span>
                            <span className="stat-label">SSH Keys</span>
                        </div>
                    </div>
                    <div className="stat-bar"><div className="stat-bar-fill" style={{ width: stats.keys > 0 ? '100%' : '0%' }} /></div>
                </a>

                <a href="/dashboard/hosts" className="stat-card glass-card stat-hosts" onClick={(e) => { e.preventDefault(); navigate('/dashboard/hosts'); }}>
                    <div className="stat-card-inner">
                        <div className="stat-icon-wrap">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
                            </svg>
                        </div>
                        <div className="stat-text">
                            <span className="stat-number">{loading ? '—' : stats.hosts}</span>
                            <span className="stat-label">Saved Hosts</span>
                        </div>
                    </div>
                    <div className="stat-bar"><div className="stat-bar-fill" style={{ width: stats.hosts > 0 ? '100%' : '0%' }} /></div>
                </a>

                <a href="/dashboard/terminal" className="stat-card glass-card stat-terminal" onClick={(e) => { e.preventDefault(); navigate('/dashboard/terminal'); }}>
                    <div className="stat-card-inner">
                        <div className="stat-icon-wrap">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                            </svg>
                        </div>
                        <div className="stat-text">
                            <span className="stat-number">→</span>
                            <span className="stat-label">Quick Connect</span>
                        </div>
                    </div>
                    <div className="stat-bar"><div className="stat-bar-fill stat-bar-pulse" style={{ width: '60%' }} /></div>
                </a>

                <div className="stat-card glass-card stat-security">
                    <div className="stat-card-inner">
                        <div className="stat-icon-wrap">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <div className="stat-text">
                            <span className="stat-number">AES-256</span>
                            <span className="stat-label">Encryption</span>
                        </div>
                    </div>
                    <div className="stat-bar"><div className="stat-bar-fill" style={{ width: '100%' }} /></div>
                </div>
            </div>

            {/* Main Grid */}
            <div className="dashboard-grid">
                {/* Recent Hosts */}
                <div className="panel glass-card">
                    <div className="panel-header">
                        <h2>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><circle cx="6" cy="6" r="1" /><circle cx="6" cy="18" r="1" />
                            </svg>
                            Recent Hosts
                        </h2>
                        <a href="/dashboard/hosts" className="panel-link" onClick={(e) => { e.preventDefault(); navigate('/dashboard/hosts'); }}>View All →</a>
                    </div>
                    <div className="panel-body">
                        {loading ? (
                            <div className="panel-loading"><div className="spinner" /></div>
                        ) : hosts.length === 0 ? (
                            <div className="empty-mini">
                                <p>No hosts configured yet</p>
                                <a href="/dashboard/hosts" className="btn btn-primary btn-sm" onClick={(e) => { e.preventDefault(); navigate('/dashboard/hosts'); }}>Add Host</a>
                            </div>
                        ) : (
                            <div className="host-list">
                                {hosts.slice(0, 5).map((host, i) => (
                                    <div key={host.id} className="host-row" style={{ animationDelay: `${i * 0.05}s` }}>
                                        <div className="host-row-left">
                                            <div className={`host-dot ${host.auth_type === 'key' ? 'dot-key' : 'dot-pass'}`} />
                                            <div>
                                                <div className="host-row-name">{host.name}</div>
                                                <div className="host-row-detail">{host.username}@{host.hostname}:{host.port}</div>
                                            </div>
                                        </div>
                                        <div className="host-row-right">
                                            <span className="host-row-badge">{host.auth_type === 'key' ? '🔑' : '🔒'} {host.auth_type}</span>
                                            <button className="btn-connect" onClick={() => createSession(null, host)}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                                                </svg>
                                                Connect
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="side-panels">
                    <div className="panel glass-card">
                        <div className="panel-header">
                            <h2>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                                Security Status
                            </h2>
                        </div>
                        <div className="panel-body">
                            <div className="security-items">
                                <div className="security-row"><span className="security-check">✓</span><span>Passwords encrypted (AES-256-GCM)</span></div>
                                <div className="security-row"><span className="security-check">✓</span><span>Private keys encrypted at rest</span></div>
                                <div className="security-row"><span className="security-check">✓</span><span>JWT token authentication</span></div>
                                <div className="security-row">
                                    <span className={`security-check ${stats.keys > 0 ? '' : 'security-warn'}`}>{stats.keys > 0 ? '✓' : '!'}</span>
                                    <span>{stats.keys > 0 ? `${stats.keys} key${stats.keys > 1 ? 's' : ''} stored` : 'No keys added yet'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="panel glass-card">
                        <div className="panel-header">
                            <h2>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 20V10M12 20V4M6 20v-6" />
                                </svg>
                                Quick Stats
                            </h2>
                        </div>
                        <div className="panel-body">
                            <div className="quick-stats">
                                <div className="qs-item"><span className="qs-label">Key Auth Hosts</span><span className="qs-value">{authTypeCounts['key'] || 0}</span></div>
                                <div className="qs-item"><span className="qs-label">Password Auth Hosts</span><span className="qs-value">{authTypeCounts['password'] || 0}</span></div>
                                <div className="qs-item"><span className="qs-label">Stored Credentials</span><span className="qs-value">{hosts.filter(h => h.has_password).length}</span></div>
                                <div className="qs-item"><span className="qs-label">Total Keys</span><span className="qs-value">{stats.keys}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
