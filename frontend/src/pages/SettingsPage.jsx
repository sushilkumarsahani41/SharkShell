import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../api';

export default function SettingsPage() {
    const { token } = useAuth();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newKey, setNewKey] = useState(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState(false);
    const [toast, setToast] = useState(null);

    const mcpUrl = `${window.location.origin}/api/mcp`;

    useEffect(() => {
        if (token) fetchStatus();
    }, [token]);

    function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }

    async function fetchStatus() {
        try {
            const res = await fetch(apiUrl('/api/mcp/token'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setStatus(await res.json());
        } catch { } finally { setLoading(false); }
    }

    async function createOrResetKey() {
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/api/mcp/token'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setNewKey(data.token);
                setConfirmReset(false);
                showToast(status?.active ? 'Access key reset!' : 'Access key created!');
                fetchStatus();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to generate key', 'error');
            }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    async function revokeKey() {
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/api/mcp/token'), {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setConfirmRevoke(false);
                setNewKey(null);
                showToast('Access key revoked');
                fetchStatus();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to revoke key', 'error');
            }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    function copyText(text, label) {
        navigator.clipboard.writeText(text).then(() => showToast(`${label} copied to clipboard`));
    }

    const claudeConfig = JSON.stringify({
        mcpServers: {
            sharkshell: {
                type: 'http',
                url: mcpUrl,
                headers: { Authorization: `Bearer ${newKey || 'YOUR_ACCESS_KEY'}` },
            },
        },
    }, null, 2);

    return (
        <div>
            {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}

            <div className="page-header">
                <div><h1>Settings</h1><p>Configure integrations and access</p></div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner spinner-lg" /></div>
            ) : (
                <div className="settings-section glass-card">
                    <div className="settings-section-header">
                        <div className="settings-section-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" />
                                <circle cx="12" cy="15" r="1.5" />
                            </svg>
                        </div>
                        <div>
                            <h2>MCP Access</h2>
                            <p>Let AI assistants (Claude, and other MCP clients) manage your servers through SharkShell — list hosts, inspect keys, and run commands over SSH.</p>
                        </div>
                        {status?.active
                            ? <span className="badge badge-success">Active</span>
                            : <span className="badge badge-warning">Not configured</span>}
                    </div>

                    {status?.active && (
                        <div className="mcp-key-status">
                            <div className="mcp-key-row">
                                <span className="mcp-key-label">Access key</span>
                                <code className="mcp-key-code">{status.tokenPrefix}••••••••••••••••</code>
                            </div>
                            <div className="mcp-key-row">
                                <span className="mcp-key-label">Created</span>
                                <span>{new Date(status.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="mcp-key-row">
                                <span className="mcp-key-label">Last used</span>
                                <span>{status.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : 'Never'}</span>
                            </div>
                        </div>
                    )}

                    {newKey && (
                        <div className="mcp-new-key">
                            <div className="mcp-new-key-header">
                                <strong>Your new access key</strong>
                                <span>Copy it now — it won't be shown again.</span>
                            </div>
                            <div className="mcp-key-reveal">
                                <code>{newKey}</code>
                                <button className="btn btn-secondary btn-sm" onClick={() => copyText(newKey, 'Access key')}>Copy</button>
                            </div>
                        </div>
                    )}

                    <div className="mcp-actions">
                        {!status?.active ? (
                            <button className="btn btn-primary" onClick={createOrResetKey} disabled={submitting}>
                                {submitting ? <span className="spinner" /> : 'Create Access Key'}
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-secondary" onClick={() => setConfirmReset(true)} disabled={submitting}>Reset Key</button>
                                <button className="btn btn-danger" onClick={() => setConfirmRevoke(true)} disabled={submitting}>Revoke</button>
                            </>
                        )}
                    </div>

                    <div className="mcp-setup">
                        <h3>Connect an MCP client</h3>
                        <p>MCP endpoint (Streamable HTTP):</p>
                        <div className="mcp-key-reveal">
                            <code>{mcpUrl}</code>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyText(mcpUrl, 'Endpoint URL')}>Copy</button>
                        </div>
                        <p>Add to Claude Code with one command:</p>
                        <div className="mcp-key-reveal">
                            <code>{`claude mcp add --transport http sharkshell ${mcpUrl} --header "Authorization: Bearer ${newKey || 'YOUR_ACCESS_KEY'}"`}</code>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyText(`claude mcp add --transport http sharkshell ${mcpUrl} --header "Authorization: Bearer ${newKey || 'YOUR_ACCESS_KEY'}"`, 'Command')}>Copy</button>
                        </div>
                        <p>Or use this JSON config (<code className="mcp-inline-code">.mcp.json</code>):</p>
                        <div className="mcp-key-reveal mcp-key-reveal-block">
                            <pre>{claudeConfig}</pre>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyText(claudeConfig, 'Config')}>Copy</button>
                        </div>
                        <p className="mcp-note">⚠️ The access key grants command execution on all your saved hosts. Treat it like a password.</p>
                    </div>
                </div>
            )}

            {/* Reset Confirmation */}
            {confirmReset && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmReset(false)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
                        <h2 style={{ marginBottom: 8 }}>Reset Access Key?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            A new key will be generated and the current key will stop working immediately. Any connected MCP clients must be updated.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={createOrResetKey} disabled={submitting}>
                                {submitting ? <span className="spinner" /> : 'Reset Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Revoke Confirmation */}
            {confirmRevoke && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRevoke(false)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Revoke Access Key?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            MCP access will be disabled and all connected clients will lose access immediately.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmRevoke(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={revokeKey} disabled={submitting}>
                                {submitting ? <span className="spinner" /> : 'Revoke'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
