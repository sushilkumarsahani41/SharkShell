import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../api';

const CAP_LABELS = { read_only: 'Read-only', execute: 'Execute' };
const EXPIRY_OPTIONS = [
    { value: '', label: 'Never' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
];

const emptyForm = { label: '', capability: 'execute', scopeAll: true, allowedHostIds: [], allowedGroupIds: [], expiresInDays: '' };

export default function McpPage() {
    const { token } = useAuth();
    const [keys, setKeys] = useState([]);
    const [hosts, setHosts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [audit, setAudit] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [editKey, setEditKey] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const [revealKey, setRevealKey] = useState(null); // { token, label } shown once
    const [confirmRevoke, setConfirmRevoke] = useState(null);
    const [confirmReset, setConfirmReset] = useState(null);

    const mcpUrl = `${window.location.origin}/api/mcp`;

    useEffect(() => { if (token) refreshAll(); }, [token]);

    function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }
    function authHeaders(json) { return json ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}` }; }

    async function refreshAll() {
        setLoading(true);
        try {
            const [k, h, g, a] = await Promise.all([
                fetch(apiUrl('/api/mcp/token'), { headers: authHeaders() }),
                fetch(apiUrl('/api/hosts'), { headers: authHeaders() }),
                fetch(apiUrl('/api/groups?type=host'), { headers: authHeaders() }),
                fetch(apiUrl('/api/mcp/audit?limit=100'), { headers: authHeaders() }),
            ]);
            if (k.ok) setKeys((await k.json()).keys || []);
            if (h.ok) setHosts((await h.json()).hosts || []);
            if (g.ok) setGroups((await g.json()).groups || []);
            if (a.ok) setAudit((await a.json()).entries || []);
        } catch { } finally { setLoading(false); }
    }

    function openCreate() { setEditKey(null); setForm({ ...emptyForm, label: '' }); setShowModal(true); }
    function openEdit(k) {
        setEditKey(k);
        setForm({
            label: k.label,
            capability: k.capability,
            scopeAll: k.scope_all,
            allowedHostIds: k.allowed_host_ids || [],
            allowedGroupIds: k.allowed_group_ids || [],
            expiresInDays: '',
        });
        setShowModal(true);
    }

    function toggleId(list, id) { return list.includes(id) ? list.filter(x => x !== id) : [...list, id]; }

    async function submitKey(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = {
                label: form.label,
                capability: form.capability,
                scopeAll: form.scopeAll,
                allowedHostIds: form.scopeAll ? [] : form.allowedHostIds,
                allowedGroupIds: form.scopeAll ? [] : form.allowedGroupIds,
                expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null,
            };
            const url = editKey ? apiUrl(`/api/mcp/token/${editKey.id}`) : apiUrl('/api/mcp/token');
            const res = await fetch(url, { method: editKey ? 'PATCH' : 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
            if (res.ok) {
                const data = await res.json();
                setShowModal(false);
                if (!editKey && data.token) setRevealKey({ token: data.token, label: data.key.label });
                showToast(editKey ? 'Key updated' : 'Key created');
                refreshAll();
            } else {
                showToast((await res.json()).error || 'Failed', 'error');
            }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    async function resetKey(k) {
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl(`/api/mcp/token/${k.id}/reset`), { method: 'POST', headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setConfirmReset(null);
                setRevealKey({ token: data.token, label: data.key.label });
                showToast('Key rotated');
                refreshAll();
            } else { showToast((await res.json()).error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    async function revokeKey(k) {
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl(`/api/mcp/token/${k.id}`), { method: 'DELETE', headers: authHeaders() });
            if (res.ok) { setConfirmRevoke(null); showToast('Key revoked'); refreshAll(); }
            else { showToast((await res.json()).error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    function copyText(text, label) { navigator.clipboard.writeText(text).then(() => showToast(`${label} copied`)); }

    function scopeSummary(k) {
        if (k.scope_all) return 'All hosts';
        const hostNames = (k.allowed_host_ids || []).map(id => hosts.find(h => h.id === id)?.name).filter(Boolean);
        const groupNames = (k.allowed_group_ids || []).map(id => groups.find(g => g.id === id)?.name).filter(Boolean);
        const parts = [];
        if (groupNames.length) parts.push(`${groupNames.length} group${groupNames.length > 1 ? 's' : ''}`);
        if (hostNames.length) parts.push(`${hostNames.length} host${hostNames.length > 1 ? 's' : ''}`);
        return parts.length ? parts.join(' + ') : 'No hosts';
    }

    const connectCmd = (t) => `claude mcp add --transport http sharkshell ${mcpUrl} --header "Authorization: Bearer ${t}"`;

    function expirySummary(k) {
        if (!k.expires_at) return 'Never expires';
        const isPast = new Date(k.expires_at) < new Date();
        return `${isPast ? 'Expired' : 'Expires'} ${new Date(k.expires_at).toLocaleDateString()}`;
    }

    return (
        <div>
            {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}

            <div className="page-header">
                <div><h1>MCP Access</h1><p>Scoped keys for AI assistants &amp; MCP clients</p></div>
                <button className="btn btn-primary" onClick={openCreate}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    New Access Key
                </button>
            </div>

            <div className="settings-intro glass-card">
                <div className="settings-section-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" /><circle cx="12" cy="15" r="1.5" />
                    </svg>
                </div>
                <div>
                    <h2>MCP Access</h2>
                    <p>Issue scoped keys so AI assistants (Claude and other MCP clients) can manage your servers through SharkShell. Each key can be limited to specific hosts and to read-only vs. command execution. Endpoint: <code className="mcp-inline-code">{mcpUrl}</code></p>
                    <p style={{ marginTop: 8 }}>Most MCP clients (including Claude) can connect with just this URL — pasting it triggers an OAuth approval popup instead of a manual key. Keys created that way appear below tagged <strong>OAuth</strong> and can be revoked like any other.</p>
                </div>
            </div>

            {revealKey && (
                <div className="mcp-new-key glass-card">
                    <div className="mcp-new-key-header">
                        <strong>New key for “{revealKey.label}”</strong>
                        <span>Copy it now — it won't be shown again.</span>
                    </div>
                    <div className="mcp-key-reveal">
                        <code>{revealKey.token}</code>
                        <button className="btn btn-secondary btn-sm" onClick={() => copyText(revealKey.token, 'Access key')}>Copy</button>
                    </div>
                    <div className="mcp-key-reveal">
                        <code>{connectCmd(revealKey.token)}</code>
                        <button className="btn btn-secondary btn-sm" onClick={() => copyText(connectCmd(revealKey.token), 'Command')}>Copy</button>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRevealKey(null)}>Dismiss</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner spinner-lg" /></div>
            ) : keys.length === 0 ? (
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" /><circle cx="12" cy="15" r="1.5" /></svg>
                    <h3>No Access Keys</h3>
                    <p>Create a scoped key to let an MCP client connect to SharkShell.</p>
                </div>
            ) : (
                <div className="mcp-key-list">
                    {keys.map(k => (
                        <div key={k.id} className="mcp-key-card glass-card">
                            <div className="mcp-key-card-main">
                                <div className="mcp-key-card-title">
                                    <span className="mcp-key-card-label">{k.label}</span>
                                    {k.oauth_client_id && <span className="badge badge-info">OAuth</span>}
                                    <span className={`badge ${k.capability === 'execute' ? 'badge-warning' : 'badge-info'}`}>{CAP_LABELS[k.capability]}</span>
                                    <span className={`badge ${k.scope_all ? 'badge-danger' : 'badge-success'}`}>{scopeSummary(k)}</span>
                                </div>
                                <div className="mcp-key-card-meta">
                                    <code className="mcp-key-code">{k.token_prefix}••••••••</code>
                                    <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                                    <span>Last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</span>
                                    <span>{expirySummary(k)}</span>
                                </div>
                            </div>
                            <div className="mcp-key-card-actions">
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(k)}>Edit</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(k)}>Reset</button>
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirmRevoke(k)}>Revoke</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Audit log */}
            {!loading && (
                <div className="mcp-audit glass-card">
                    <div className="mcp-audit-header">
                        <h3>Activity Log</h3>
                        <button className="btn btn-ghost btn-sm" onClick={refreshAll}>Refresh</button>
                    </div>
                    {audit.length === 0 ? (
                        <p className="mcp-audit-empty">No MCP activity yet. Tool calls made with your keys will appear here.</p>
                    ) : (
                        <div className="mcp-audit-scroll">
                            <table className="mcp-audit-table">
                                <thead><tr><th>Time</th><th>Key</th><th>Tool</th><th>Host</th><th>Status</th></tr></thead>
                                <tbody>
                                    {audit.map(e => (
                                        <tr key={e.id}>
                                            <td>{new Date(e.created_at).toLocaleString()}</td>
                                            <td>{e.token_label || '—'}</td>
                                            <td><code>{e.tool_name}</code>{e.command ? <span className="mcp-audit-cmd" title={e.command}>{e.command}</span> : null}</td>
                                            <td>{e.host_name || '—'}</td>
                                            <td><span className={`mcp-status mcp-status-${e.status}`}>{e.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: 520 }}>
                        <h2>{editKey ? 'Edit Access Key' : 'New Access Key'}</h2>
                        <form onSubmit={submitKey}>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Label</label>
                                <input className="input-field" placeholder="e.g. Claude Desktop" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} required />
                            </div>

                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Capability</label>
                                <div className="mcp-radio-row">
                                    <label className={`mcp-radio ${form.capability === 'read_only' ? 'mcp-radio-active' : ''}`}>
                                        <input type="radio" name="cap" checked={form.capability === 'read_only'} onChange={() => setForm({ ...form, capability: 'read_only' })} />
                                        <div><strong>Read-only</strong><span>List hosts &amp; keys. Cannot run commands.</span></div>
                                    </label>
                                    <label className={`mcp-radio ${form.capability === 'execute' ? 'mcp-radio-active' : ''}`}>
                                        <input type="radio" name="cap" checked={form.capability === 'execute'} onChange={() => setForm({ ...form, capability: 'execute' })} />
                                        <div><strong>Execute</strong><span>Run commands on allowed hosts.</span></div>
                                    </label>
                                </div>
                            </div>

                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Expires</label>
                                <select className="input-field" value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: e.target.value })}>
                                    {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {editKey && <p className="mcp-note" style={{ marginTop: 6 }}>Currently: {expirySummary(editKey)}. Saving with "Never" removes any expiry.</p>}
                            </div>

                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Host scope</label>
                                <label className="mcp-checkline">
                                    <input type="checkbox" checked={form.scopeAll} onChange={e => setForm({ ...form, scopeAll: e.target.checked })} />
                                    <span>All hosts (current and future)</span>
                                </label>
                            </div>

                            {!form.scopeAll && (
                                <div className="mcp-scope-picker">
                                    {groups.length > 0 && (
                                        <>
                                            <div className="mcp-scope-heading">Groups</div>
                                            {groups.map(g => (
                                                <label key={g.id} className="mcp-checkline">
                                                    <input type="checkbox" checked={form.allowedGroupIds.includes(g.id)} onChange={() => setForm({ ...form, allowedGroupIds: toggleId(form.allowedGroupIds, g.id) })} />
                                                    <span className="group-dot" style={{ background: g.color }} />{g.name}
                                                </label>
                                            ))}
                                        </>
                                    )}
                                    <div className="mcp-scope-heading">Hosts</div>
                                    {hosts.length === 0 && <p className="mcp-audit-empty">No hosts saved yet.</p>}
                                    {hosts.map(h => (
                                        <label key={h.id} className="mcp-checkline">
                                            <input type="checkbox" checked={form.allowedHostIds.includes(h.id)} onChange={() => setForm({ ...form, allowedHostIds: toggleId(form.allowedHostIds, h.id) })} />
                                            <span>{h.name} <span className="mcp-host-addr">{h.username}@{h.hostname}</span></span>
                                        </label>
                                    ))}
                                    {!form.scopeAll && form.allowedHostIds.length === 0 && form.allowedGroupIds.length === 0 && (
                                        <p className="mcp-note" style={{ marginTop: 8 }}>⚠️ With no hosts or groups selected, this key can reach no hosts.</p>
                                    )}
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? <span className="spinner" /> : (editKey ? 'Save' : 'Create Key')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset confirm */}
            {confirmReset && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmReset(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
                        <h2 style={{ marginBottom: 8 }}>Reset “{confirmReset.label}”?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>A new key is generated and the current one stops working immediately. Scope and capability are kept.</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmReset(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => resetKey(confirmReset)} disabled={submitting}>{submitting ? <span className="spinner" /> : 'Reset'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Revoke confirm */}
            {confirmRevoke && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRevoke(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Revoke “{confirmRevoke.label}”?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>Any client using this key loses access immediately. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmRevoke(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => revokeKey(confirmRevoke)} disabled={submitting}>{submitting ? <span className="spinner" /> : 'Revoke'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
