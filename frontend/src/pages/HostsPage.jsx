import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTerminal } from '../context/TerminalContext';
import { apiUrl } from '../api';

export default function HostsPage() {
    const { token } = useAuth();
    const { createSession } = useTerminal();
    const [hosts, setHosts] = useState([]);
    const [keys, setKeys] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [editHost, setEditHost] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editGroup, setEditGroup] = useState(null);
    const [groupForm, setGroupForm] = useState({ name: '', color: '#6366f1' });
    const [groupSubmitting, setGroupSubmitting] = useState(false);
    const [deleteGroupId, setDeleteGroupId] = useState(null);
    const [form, setForm] = useState({ name: '', hostname: '', port: '22', username: '', authType: 'key', sshKeyId: '', password: '', groupId: '' });

    const GROUP_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

    useEffect(() => {
        if (token) { fetchHosts(); fetchKeys(); fetchGroups(); }
    }, [token]);

    async function fetchHosts() {
        try {
            const res = await fetch(apiUrl('/api/hosts'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setHosts(data.hosts || []); }
        } catch { } finally { setLoading(false); }
    }

    async function fetchKeys() {
        try {
            const res = await fetch(apiUrl('/api/keys'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setKeys(data.keys || []); }
        } catch { }
    }

    async function fetchGroups() {
        try {
            const res = await fetch(apiUrl('/api/groups?type=host'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setGroups(data.groups || []); }
        } catch { }
    }

    function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }

    function openAdd() {
        setForm({ name: '', hostname: '', port: '22', username: '', authType: 'key', sshKeyId: '', password: '', groupId: '' });
        setEditHost(null);
        setShowAdd(true);
    }

    function openEdit(host) {
        setForm({ name: host.name, hostname: host.hostname, port: String(host.port), username: host.username, authType: host.auth_type, sshKeyId: host.ssh_key_id || '', password: '', groupId: host.group_id || '' });
        setEditHost(host);
        setShowAdd(true);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const url = apiUrl(editHost ? `/api/hosts/${editHost.id}` : '/api/hosts');
            const method = editHost ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: form.name, hostname: form.hostname, port: parseInt(form.port) || 22, username: form.username, authType: form.authType, sshKeyId: form.sshKeyId || null, password: form.password || undefined, groupId: form.groupId || null }),
            });
            if (res.ok) { showToast(editHost ? 'Host updated!' : 'Host added!'); setShowAdd(false); fetchHosts(); }
            else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSubmitting(false); }
    }

    async function deleteHost(id) {
        try {
            const res = await fetch(apiUrl(`/api/hosts/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast('Host deleted'); setDeleteConfirmId(null); fetchHosts(); }
            else { const data = await res.json(); showToast(data.error || 'Delete failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
    }

    // --- Group CRUD ---
    function openGroupModal(group = null) {
        if (group) {
            setEditGroup(group);
            setGroupForm({ name: group.name, color: group.color || '#6366f1' });
        } else {
            setEditGroup(null);
            setGroupForm({ name: '', color: '#6366f1' });
        }
        setShowGroupModal(true);
    }

    async function handleGroupSubmit(e) {
        e.preventDefault();
        setGroupSubmitting(true);
        try {
            const url = editGroup ? apiUrl(`/api/groups/${editGroup.id}`) : apiUrl('/api/groups');
            const method = editGroup ? 'PATCH' : 'POST';
            const body = editGroup ? { name: groupForm.name, color: groupForm.color } : { name: groupForm.name, type: 'host', color: groupForm.color };
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (res.ok) { showToast(editGroup ? 'Group updated!' : 'Group created!'); setShowGroupModal(false); fetchGroups(); fetchHosts(); }
            else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setGroupSubmitting(false); }
    }

    async function deleteGroup(id) {
        try {
            const res = await fetch(apiUrl(`/api/groups/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast('Group deleted'); setDeleteGroupId(null); if (selectedGroup === id) setSelectedGroup('all'); fetchGroups(); fetchHosts(); }
            else { const data = await res.json(); showToast(data.error || 'Delete failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
    }

    const filteredHosts = selectedGroup === 'all' ? hosts : selectedGroup === 'ungrouped' ? hosts.filter(h => !h.group_id) : hosts.filter(h => h.group_id === selectedGroup);

    return (
        <div>
            {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}

            <div className="page-header">
                <div><h1>Hosts</h1><p>Manage your server connections</p></div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => openGroupModal()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        New Group
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Add Host
                    </button>
                </div>
            </div>

            {/* Group Filter Bar */}
            {groups.length > 0 && (
                <div className="group-filter-bar">
                    <button className={`group-pill ${selectedGroup === 'all' ? 'group-pill-active' : ''}`} onClick={() => setSelectedGroup('all')}>
                        All <span className="group-pill-count">{hosts.length}</span>
                    </button>
                    {groups.map(g => (
                        <button key={g.id} className={`group-pill ${selectedGroup === g.id ? 'group-pill-active' : ''}`} onClick={() => setSelectedGroup(g.id)}>
                            <span className="group-dot" style={{ background: g.color }} />
                            {g.name} <span className="group-pill-count">{g.item_count}</span>
                            <span className="group-pill-actions" onClick={e => e.stopPropagation()}>
                                <button className="group-pill-btn" onClick={() => openGroupModal(g)} title="Edit group">✎</button>
                                <button className="group-pill-btn group-pill-btn-danger" onClick={() => setDeleteGroupId(g.id)} title="Delete group">×</button>
                            </span>
                        </button>
                    ))}
                    <button className={`group-pill ${selectedGroup === 'ungrouped' ? 'group-pill-active' : ''}`} onClick={() => setSelectedGroup('ungrouped')}>
                        Ungrouped <span className="group-pill-count">{hosts.filter(h => !h.group_id).length}</span>
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner spinner-lg" /></div>
            ) : filteredHosts.length === 0 ? (
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
                    <h3>{selectedGroup !== 'all' ? 'No Hosts in This Group' : 'No Hosts Saved'}</h3>
                    <p>{selectedGroup !== 'all' ? 'Assign hosts to this group or add a new host.' : 'Add your server connections to quickly connect from the terminal.'}</p>
                </div>
            ) : (
                <div className="card-grid">
                    {filteredHosts.map((host, i) => (
                        <div
                            key={host.id}
                            className={`host-card glass-card ${host.group_color ? 'host-card-grouped' : ''}`}
                            style={{
                                animationDelay: `${i * 0.05}s`,
                                ...(host.group_color ? { '--glow-color': host.group_color } : {}),
                            }}
                        >
                            <div className="host-card-header">
                                <div className="host-card-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
                                </div>
                                <div>
                                    <h3 className="host-card-name">{host.name}</h3>
                                    <span className="host-card-addr">{host.username}@{host.hostname}:{host.port}</span>
                                </div>
                            </div>
                            <div className="host-card-meta">
                                <span className={`badge ${host.auth_type === 'key' ? 'badge-info' : 'badge-warning'}`}>{host.auth_type === 'key' ? '🔑 Key Auth' : '🔒 Password'}</span>
                                {host.key_name && <span className="host-key-name">{host.key_name}</span>}
                                {host.has_password && <span className="badge badge-success" style={{ fontSize: 10 }}>Saved</span>}
                            </div>
                            <div className="host-card-actions">
                                <button className="btn btn-primary btn-sm" onClick={() => createSession(null, host)}>Connect</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(host)}>Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmId(host.id)}>Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAdd && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
                    <div className="modal">
                        <h2>{editHost ? 'Edit Host' : 'Add Host'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="input-group" style={{ marginBottom: 14 }}><label>Name</label><input className="input-field" placeholder="My Server" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, marginBottom: 14 }}>
                                <div className="input-group"><label>Hostname / IP</label><input className="input-field" placeholder="192.168.1.100" value={form.hostname} onChange={e => setForm({ ...form, hostname: e.target.value })} required /></div>
                                <div className="input-group"><label>Port</label><input className="input-field" type="number" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} /></div>
                            </div>
                            <div className="input-group" style={{ marginBottom: 14 }}><label>Username</label><input className="input-field" placeholder="root" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required /></div>
                            <div className="input-group" style={{ marginBottom: 14 }}>
                                <label>Auth Method</label>
                                <select className="input-field" value={form.authType} onChange={e => setForm({ ...form, authType: e.target.value })}>
                                    <option value="key">SSH Key</option><option value="password">Password</option>
                                </select>
                            </div>
                            {form.authType === 'key' && (
                                <div className="input-group" style={{ marginBottom: 14 }}>
                                    <label>SSH Key</label>
                                    <select className="input-field" value={form.sshKeyId} onChange={e => setForm({ ...form, sshKeyId: e.target.value })}>
                                        <option value="">Select a key...</option>
                                        {keys.map(k => <option key={k.id} value={k.id}>{k.name} ({k.key_type})</option>)}
                                    </select>
                                </div>
                            )}
                            {form.authType === 'password' && (
                                <div className="input-group" style={{ marginBottom: 14 }}>
                                    <label>SSH Password <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(encrypted at rest)</span></label>
                                    <input type="password" className="input-field" placeholder={editHost ? 'Leave empty to keep current' : 'Enter SSH password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                                </div>
                            )}
                            <div className="input-group" style={{ marginBottom: 14 }}>
                                <label>Group <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                                <select className="input-field" value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })}>
                                    <option value="">No group</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? <span className="spinner" /> : (editHost ? 'Update' : 'Add Host')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Group Create/Edit Modal */}
            {showGroupModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowGroupModal(false)}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2>{editGroup ? 'Edit Group' : 'New Host Group'}</h2>
                        <form onSubmit={handleGroupSubmit}>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Group Name</label>
                                <input className="input-field" placeholder="e.g. Production" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} required />
                            </div>
                            <div className="input-group" style={{ marginBottom: 20 }}>
                                <label>Color</label>
                                <div className="group-color-picker">
                                    {GROUP_COLORS.map(c => (
                                        <button key={c} type="button" className={`group-color-swatch ${groupForm.color === c ? 'group-color-active' : ''}`} style={{ background: c }} onClick={() => setGroupForm({ ...groupForm, color: c })} />
                                    ))}
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowGroupModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={groupSubmitting}>{groupSubmitting ? <span className="spinner" /> : (editGroup ? 'Update' : 'Create Group')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Host Confirmation */}
            {deleteConfirmId && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteConfirmId(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Delete Host?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            Are you sure you want to delete <strong>{hosts.find(h => h.id === deleteConfirmId)?.name}</strong>? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => deleteHost(deleteConfirmId)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Group Confirmation */}
            {deleteGroupId && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteGroupId(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
                        <h2 style={{ marginBottom: 8 }}>Delete Group?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
                            Hosts in this group will become ungrouped. This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setDeleteGroupId(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => deleteGroup(deleteGroupId)}>Delete Group</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
