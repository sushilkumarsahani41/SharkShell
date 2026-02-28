import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTerminal } from '../context/TerminalContext';

const navItems = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        label: 'Keystore',
        href: '/dashboard/keys',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
        ),
    },
    {
        label: 'Hosts',
        href: '/dashboard/hosts',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
        ),
    },
    {
        label: 'Terminal',
        href: '/dashboard/terminal',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
        ),
    },
];

const statusColors = { connecting: 'var(--warning)', connected: 'var(--success)', disconnected: 'var(--danger)', saved: 'var(--text-tertiary)' };

export default function DashboardLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const {
        workspaces, activeWorkspaceId, activeSessionId,
        createWorkspace, renameWorkspace, deleteWorkspace,
        switchSession, closeSession, setActiveWorkspaceId,
        reconnectSession, reconnectWorkspace,
    } = useTerminal();

    const [expandedWs, setExpandedWs] = useState({ 'ws-default': true });
    const [renamingWsId, setRenamingWsId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [showNewWs, setShowNewWs] = useState(false);
    const [newWsName, setNewWsName] = useState('');

    function toggleExpand(wsId) {
        setExpandedWs(prev => ({ ...prev, [wsId]: !prev[wsId] }));
    }

    function startRename(ws) {
        setRenamingWsId(ws.id);
        setRenameValue(ws.name);
    }

    function submitRename(wsId) {
        if (renameValue.trim()) renameWorkspace(wsId, renameValue.trim());
        setRenamingWsId(null);
    }

    function handleNewWs() {
        if (newWsName.trim()) {
            const id = createWorkspace(newWsName.trim());
            setExpandedWs(prev => ({ ...prev, [id]: true }));
        }
        setNewWsName('');
        setShowNewWs(false);
    }

    const totalSessions = workspaces.reduce((sum, w) => sum + w.sessions.length, 0);

    return (
        <div className="dashboard-layout">
            <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo" onClick={() => navigate('/dashboard')}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#sideGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <defs>
                                <linearGradient id="sideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        {!sidebarCollapsed && <span>SharkShell</span>}
                    </div>
                    <button className="sidebar-toggle btn-ghost" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            className={`sidebar-link ${location.pathname === item.href ? 'active' : ''}`}
                            onClick={(e) => {
                                e.preventDefault();
                                navigate(item.href);
                            }}
                        >
                            {item.icon}
                            {!sidebarCollapsed && <span>{item.label}</span>}
                        </a>
                    ))}
                </nav>

                {/* ─── Workspaces Section ─── */}
                {!sidebarCollapsed && (
                    <div className="sidebar-workspaces">
                        <div className="ws-header">
                            <span className="ws-header-label">
                                Workspaces
                                {totalSessions > 0 && <span className="ws-session-count">{totalSessions}</span>}
                            </span>
                            <button className="ws-add-btn" onClick={() => setShowNewWs(true)} title="New workspace">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>

                        {/* Inline new workspace */}
                        {showNewWs && (
                            <div className="ws-new-inline">
                                <input
                                    className="ws-rename-input"
                                    value={newWsName}
                                    onChange={e => setNewWsName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleNewWs(); if (e.key === 'Escape') setShowNewWs(false); }}
                                    placeholder="Workspace name..."
                                    autoFocus
                                />
                                <button className="ws-inline-btn" onClick={handleNewWs}>✓</button>
                                <button className="ws-inline-btn" onClick={() => setShowNewWs(false)}>✕</button>
                            </div>
                        )}

                        {/* Workspace Tree */}
                        <div className="ws-tree">
                            {workspaces.map(ws => (
                                <div key={ws.id} className={`ws-item ${activeWorkspaceId === ws.id ? 'ws-item-active' : ''}`}>
                                    <div className="ws-item-header" onClick={() => { toggleExpand(ws.id); setActiveWorkspaceId(ws.id); }}>
                                        <svg className={`ws-chevron ${expandedWs[ws.id] ? 'ws-chevron-open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                        {renamingWsId === ws.id ? (
                                            <input
                                                className="ws-rename-input"
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') submitRename(ws.id); if (e.key === 'Escape') setRenamingWsId(null); }}
                                                onBlur={() => submitRename(ws.id)}
                                                autoFocus
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span className="ws-item-name">{ws.name}</span>
                                        )}
                                        {ws.sessions.length > 0 && <span className="ws-badge">{ws.sessions.length}</span>}
                                        <span className="ws-item-actions" onClick={e => e.stopPropagation()}>
                                            {ws.sessions.some(s => s.status === 'saved' || s.status === 'disconnected') && (
                                                <button className="ws-action-btn ws-action-reconnect" onClick={() => reconnectWorkspace(ws.id)} title="Reconnect all">↻</button>
                                            )}
                                            <button className="ws-action-btn" onClick={() => startRename(ws)} title="Rename">✎</button>
                                            {ws.id !== 'ws-default' && (
                                                <button className="ws-action-btn ws-action-danger" onClick={() => deleteWorkspace(ws.id)} title="Delete">×</button>
                                            )}
                                        </span>
                                    </div>

                                    {/* Sessions */}
                                    {expandedWs[ws.id] && ws.sessions.length > 0 && (
                                        <div className="ws-sessions">
                                            {ws.sessions.map(s => (
                                                <div
                                                    key={s.id}
                                                    className={`ws-session ${activeSessionId === s.id ? 'ws-session-active' : ''}`}
                                                    onClick={() => s.status === 'saved' || s.status === 'disconnected' ? reconnectSession(s.id) : switchSession(ws.id, s.id)}
                                                >
                                                    <span className="ws-session-dot" style={{ background: statusColors[s.status] || 'var(--text-tertiary)' }} />
                                                    <span className="ws-session-name">{s.hostName}</span>
                                                    <span className="ws-session-addr">
                                                        {s.status === 'saved' ? '💾 saved' : s.status === 'disconnected' ? '⚡ click to reconnect' : s.hostAddr}
                                                    </span>
                                                    <button className="ws-session-close" onClick={e => { e.stopPropagation(); closeSession(s.id); }} title="Remove">×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {expandedWs[ws.id] && ws.sessions.length === 0 && (
                                        <div className="ws-empty">No sessions</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <div className="sidebar-avatar">
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        {!sidebarCollapsed && (
                            <div className="sidebar-user-info">
                                <span className="sidebar-user-name">{user?.name}</span>
                                <span className="sidebar-user-email">{user?.email}</span>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        {!sidebarCollapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            <main className="dashboard-main">
                <Outlet />
            </main>
        </div>
    );
}
