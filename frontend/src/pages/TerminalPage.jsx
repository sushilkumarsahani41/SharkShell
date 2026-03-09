import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTerminal } from '../context/TerminalContext';
import { apiUrl } from '../api';

export default function TerminalPage() {
    const { token } = useAuth();
    const {
        workspaces, activeWorkspaceId, activeSessionId,
        activeWorkspace, setActiveSessionId,
        createSession, closeSession, connectGroup, getSessionRefs,
        reconnectSession,
        passphrasePrompt, submitPassphrase, cancelPassphrase,
    } = useTerminal();
    const [passphraseInput, setPassphraseInput] = useState('');

    const [hosts, setHosts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [showAddHost, setShowAddHost] = useState(false);
    const [addHostId, setAddHostId] = useState('');
    const [showGroupConnect, setShowGroupConnect] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');

    useEffect(() => {
        if (token) { fetchHosts(); fetchGroups(); }
    }, [token]);

    async function fetchHosts() {
        try {
            const res = await fetch(apiUrl('/api/hosts'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setHosts(data.hosts || []); }
        } catch { }
    }

    async function fetchGroups() {
        try {
            const res = await fetch(apiUrl('/api/groups?type=host'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setGroups(data.groups || []); }
        } catch { }
    }

    function handleAddHost() {
        if (!addHostId) return;
        const host = hosts.find(h => h.id === addHostId);
        if (host) createSession(activeWorkspaceId, host);
        setAddHostId('');
        setShowAddHost(false);
    }

    function handleGroupConnect() {
        if (!selectedGroupId) return;
        const groupHosts = hosts.filter(h => h.group_id === selectedGroupId);
        if (groupHosts.length > 0) connectGroup(activeWorkspaceId, groupHosts);
        setSelectedGroupId('');
        setShowGroupConnect(false);
    }

    function switchTab(sessionId) {
        setActiveSessionId(sessionId);
        setTimeout(() => {
            const refs = getSessionRefs(sessionId);
            if (refs?.fitAddon) try { refs.fitAddon.fit(); } catch { }
            if (refs?.term) refs.term.focus();
        }, 30);
    }

    const sessions = activeWorkspace?.sessions || [];
    const statusColors = { connecting: 'var(--warning)', connected: 'var(--success)', disconnected: 'var(--danger)', saved: 'var(--text-tertiary)' };

    // Collect ALL sessions from ALL workspaces for persistent rendering
    const allSessions = workspaces.flatMap(ws => ws.sessions.map(s => ({ ...s, workspaceId: ws.id })));

    return (
        <div className="terminal-page">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5/css/xterm.min.css" />

            {/* Tab Bar */}
            <div className="terminal-tab-bar glass-card">
                <div className="terminal-tabs-scroll">
                    {sessions.map(s => (
                        <button
                            key={s.id}
                            className={`terminal-tab ${activeSessionId === s.id ? 'terminal-tab-active' : ''} ${s.status === 'saved' ? 'terminal-tab-saved' : ''}`}
                            onClick={() => s.status === 'saved' || s.status === 'disconnected' ? reconnectSession(s.id) : switchTab(s.id)}
                        >
                            <span className="terminal-tab-dot" style={{ background: statusColors[s.status] || 'var(--text-tertiary)' }} />
                            <span className="terminal-tab-name">{s.hostName}</span>
                            <span className="terminal-tab-addr">{s.status === 'saved' ? '💾 saved' : s.status === 'disconnected' ? '↻ reconnect' : s.hostAddr}</span>
                            <button className="terminal-tab-close" onClick={e => { e.stopPropagation(); closeSession(s.id); }} title="Close">×</button>
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="terminal-new-tab" onClick={() => setShowAddHost(!showAddHost)} title="Add host">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    {groups.length > 0 && (
                        <button className="terminal-new-tab" onClick={() => setShowGroupConnect(!showGroupConnect)} title="Connect group"
                            style={{ fontSize: 13 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Add Host Panel */}
            {showAddHost && (
                <div className="new-tab-panel glass-card">
                    <select className="input-field host-select" value={addHostId} onChange={e => setAddHostId(e.target.value)}>
                        <option value="">Select a host...</option>
                        {hosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.username}@{h.hostname}:{h.port})</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={handleAddHost} disabled={!addHostId}>Connect</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddHost(false)}>Cancel</button>
                </div>
            )}

            {/* Group Connect Panel */}
            {showGroupConnect && (
                <div className="new-tab-panel glass-card">
                    <select className="input-field host-select" value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
                        <option value="">Select a host group...</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.item_count} hosts)</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={handleGroupConnect} disabled={!selectedGroupId}>Connect All</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowGroupConnect(false)}>Cancel</button>
                </div>
            )}

            {/* Terminal Containers — render ALL sessions across ALL workspaces to prevent DOM unmount */}
            <div className="terminal-container">
                {sessions.length === 0 ? (
                    <div className="terminal-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 16 }}>
                            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                        </svg>
                        <h3>No Sessions in this Workspace</h3>
                        <p style={{ marginBottom: 16 }}>Add a host connection to get started.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" onClick={() => setShowAddHost(true)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                Add Host
                            </button>
                            {groups.length > 0 && (
                                <button className="btn btn-ghost" onClick={() => setShowGroupConnect(true)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                                    Connect Group
                                </button>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* Render ALL sessions from ALL workspaces — visibility controlled by CSS */}
                {allSessions.map(s => (
                    <div
                        key={s.id}
                        id={`term-${s.id}`}
                        className="terminal-instance"
                        style={{
                            display: (s.workspaceId === activeWorkspaceId && activeSessionId === s.id) ? 'block' : 'none'
                        }}
                    />
                ))}
            </div>

            {/* Passphrase Prompt Modal */}
            {passphrasePrompt && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && cancelPassphrase()}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2>Passphrase Required</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                            The SSH key for this host is encrypted. Enter the passphrase to connect.
                        </p>
                        <form onSubmit={(e) => { e.preventDefault(); submitPassphrase(passphraseInput); setPassphraseInput(''); }}>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <input type="password" className="input-field" placeholder="Enter key passphrase" value={passphraseInput} onChange={e => setPassphraseInput(e.target.value)} autoFocus />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => { cancelPassphrase(); setPassphraseInput(''); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!passphraseInput}>Connect</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
