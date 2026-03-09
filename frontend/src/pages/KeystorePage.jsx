import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../api';

export default function KeystorePage() {
    const { token } = useAuth();
    const [keys, setKeys] = useState([]);
    const [hosts, setHosts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showGenerate, setShowGenerate] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [showExport, setShowExport] = useState(null);
    const [genName, setGenName] = useState('');
    const [genType, setGenType] = useState('ed25519');
    const [genKeySize, setGenKeySize] = useState('4096');
    const [genPassphrase, setGenPassphrase] = useState('');
    const [genSavePassphrase, setGenSavePassphrase] = useState(false);
    const [genGroupId, setGenGroupId] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadPublic, setUploadPublic] = useState('');
    const [uploadPrivate, setUploadPrivate] = useState('');
    const [uploadPassphrase, setUploadPassphrase] = useState('');
    const [uploadGroupId, setUploadGroupId] = useState('');
    const [exportHostId, setExportHostId] = useState('');
    const [exportPassword, setExportPassword] = useState('');
    const [exportPassphrase, setExportPassphrase] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [viewKey, setViewKey] = useState(null);
    const [copiedField, setCopiedField] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editGroup, setEditGroup] = useState(null);
    const [groupForm, setGroupForm] = useState({ name: '', color: '#6366f1' });
    const [groupSubmitting, setGroupSubmitting] = useState(false);
    const [deleteGroupId, setDeleteGroupId] = useState(null);

    const GROUP_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

    useEffect(() => {
        if (token) { fetchKeys(); fetchHosts(); fetchGroups(); }
    }, [token]);

    async function fetchKeys() {
        try {
            const res = await fetch(apiUrl('/api/keys'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setKeys(data.keys || []); }
        } catch { } finally { setLoading(false); }
    }

    async function fetchHosts() {
        try {
            const res = await fetch(apiUrl('/api/hosts'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setHosts(data.hosts || []); }
        } catch { }
    }

    async function fetchGroups() {
        try {
            const res = await fetch(apiUrl('/api/groups?type=key'), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setGroups(data.groups || []); }
        } catch { }
    }

    function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }

    async function openKeyDetail(keyId) {
        try {
            const res = await fetch(apiUrl(`/api/keys/${keyId}`), { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setViewKey(data.key); }
            else showToast('Failed to load key details', 'error');
        } catch { showToast('Failed to load key details', 'error'); }
    }

    function copyField(text, field) { navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); }

    async function handleGenerate(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/api/keys'), {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'generate', name: genName, keyType: genType, keySize: genType === 'rsa' ? genKeySize : undefined, passphrase: genPassphrase || undefined, savePassphrase: genSavePassphrase, groupId: genGroupId || null }),
            });
            if (res.ok) { showToast('Key generated successfully!'); setShowGenerate(false); setGenName(''); setGenPassphrase(''); setGenSavePassphrase(false); setShowPassphrase(false); setGenGroupId(''); fetchKeys(); }
            else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); } finally { setSubmitting(false); }
    }

    async function handleUpload(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/api/keys'), {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: uploadName, publicKey: uploadPublic, privateKey: uploadPrivate, passphrase: uploadPassphrase || undefined, savePassphrase: !!uploadPassphrase, groupId: uploadGroupId || null }),
            });
            if (res.ok) { showToast('Key uploaded successfully!'); setShowUpload(false); setUploadName(''); setUploadPublic(''); setUploadPrivate(''); setUploadPassphrase(''); setUploadGroupId(''); fetchKeys(); }
            else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); } finally { setSubmitting(false); }
    }

    async function handleExport(e) {
        e.preventDefault();
        if (!showExport || !exportHostId) return;
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl('/api/keys/export'), {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ keyId: showExport.id, hostId: exportHostId, password: exportPassword || undefined, passphrase: exportPassphrase || undefined }),
            });
            const data = await res.json();
            if (res.ok) { showToast(data.message || 'Key exported!'); setShowExport(null); setExportHostId(''); setExportPassword(''); setExportPassphrase(''); }
            else showToast(data.error || 'Export failed', 'error');
        } catch (err) { showToast(err.message, 'error'); } finally { setSubmitting(false); }
    }

    async function deleteKey(id) {
        try {
            const res = await fetch(apiUrl(`/api/keys/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast('Key deleted'); setDeleteConfirmId(null); fetchKeys(); }
            else { const data = await res.json(); showToast(data.error || 'Delete failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
    }

    function copyPublicKey(key) { navigator.clipboard.writeText(key.public_key); setCopiedId(key.id); setTimeout(() => setCopiedId(null), 2000); }

    function downloadKey(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
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
            const body = editGroup ? { name: groupForm.name, color: groupForm.color } : { name: groupForm.name, type: 'key', color: groupForm.color };
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (res.ok) { showToast(editGroup ? 'Group updated!' : 'Group created!'); setShowGroupModal(false); fetchGroups(); fetchKeys(); }
            else { const data = await res.json(); showToast(data.error || 'Failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
        finally { setGroupSubmitting(false); }
    }

    async function deleteGroup(id) {
        try {
            const res = await fetch(apiUrl(`/api/groups/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast('Group deleted'); setDeleteGroupId(null); if (selectedGroup === id) setSelectedGroup('all'); fetchGroups(); fetchKeys(); }
            else { const data = await res.json(); showToast(data.error || 'Delete failed', 'error'); }
        } catch (err) { showToast(err.message, 'error'); }
    }

    const filteredKeys = selectedGroup === 'all' ? keys : selectedGroup === 'ungrouped' ? keys.filter(k => !k.group_id) : keys.filter(k => k.group_id === selectedGroup);

    return (
        <div>
            {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}

            <div className="page-header">
                <div><h1>Keystore</h1><p>Manage your SSH keys — generate, upload, and export to hosts</p></div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => openGroupModal()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        New Group
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowGenerate(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Generate Key
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowUpload(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        Upload Key
                    </button>
                </div>
            </div>

            {/* Group Filter Bar */}
            {groups.length > 0 && (
                <div className="group-filter-bar">
                    <button className={`group-pill ${selectedGroup === 'all' ? 'group-pill-active' : ''}`} onClick={() => setSelectedGroup('all')}>
                        All <span className="group-pill-count">{keys.length}</span>
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
                        Ungrouped <span className="group-pill-count">{keys.filter(k => !k.group_id).length}</span>
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner spinner-lg" /></div>
            ) : filteredKeys.length === 0 ? (
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                    <h3>{selectedGroup !== 'all' ? 'No Keys in This Group' : 'No SSH Keys Yet'}</h3>
                    <p>{selectedGroup !== 'all' ? 'Assign keys to this group or generate a new key.' : 'Generate a new key pair or upload your existing keys to get started.'}</p>
                </div>
            ) : (
                <div className="card-grid">
                    {filteredKeys.map((key, i) => (
                        <div key={key.id} className="key-card glass-card" style={{ animationDelay: `${i * 0.05}s`, cursor: 'pointer' }} onClick={() => openKeyDetail(key.id)}>
                            <div className="key-card-header">
                                <div className="key-card-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 className="key-card-name">{key.name}</h3>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className={`badge ${key.key_type?.includes('ed25519') ? 'badge-info' : key.key_type?.includes('ecdsa') ? 'badge-warning' : 'badge-success'}`}>{key.key_type?.toUpperCase()}</span>
                                        {key.group_name && (
                                            <span className="group-badge" style={{ '--group-color': key.group_color || '#6366f1' }}>
                                                <span className="group-dot" style={{ background: key.group_color || '#6366f1' }} />
                                                {key.group_name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {key.fingerprint && <div className="key-fingerprint">{key.fingerprint}</div>}
                            <div className="key-card-date">Created {new Date(key.created_at).toLocaleDateString()}</div>
                            <div className="key-card-actions">
                                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); copyPublicKey(key); }}>{copiedId === key.id ? '✓ Copied' : 'Copy Key'}</button>
                                <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setShowExport(key); setExportHostId(''); setExportPassword(''); setExportPassphrase(''); }}>Export to Host</button>
                                <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(key.id); }}>Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Generate Modal */}
            {showGenerate && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowGenerate(false)}>
                    <div className="modal gen-modal">
                        <div className="gen-modal-header"><h2>Generate SSH Key</h2><button type="button" className="gen-close" onClick={() => setShowGenerate(false)}>✕</button></div>
                        <form onSubmit={handleGenerate}>
                            <div className="input-group" style={{ marginBottom: 20 }}><label>Label</label><input className="input-field" placeholder="My Server Key" value={genName} onChange={e => setGenName(e.target.value)} required /></div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Key Type</label>
                                <div className="btn-group">
                                    {['ed25519', 'ecdsa', 'rsa'].map(t => (
                                        <button key={t} type="button" className={`btn-group-item ${genType === t ? 'active' : ''}`} onClick={() => setGenType(t)}>{t.toUpperCase()}</button>
                                    ))}
                                </div>
                                <span className="gen-hint">
                                    {genType === 'ed25519' && 'Modern, fast, small keys — recommended for most use cases'}
                                    {genType === 'ecdsa' && 'Elliptic Curve — good balance of security and compatibility'}
                                    {genType === 'rsa' && 'Legacy support — compatible with older systems and devices'}
                                </span>
                            </div>
                            {genType === 'rsa' && (
                                <div className="input-group" style={{ marginBottom: 16 }}>
                                    <label>Key Size (bits)</label>
                                    <div className="btn-group">
                                        {['4096', '2048', '1024'].map(s => (
                                            <button key={s} type="button" className={`btn-group-item ${genKeySize === s ? 'active' : ''}`} onClick={() => setGenKeySize(s)}>{s}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Group <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                                <select className="input-field" value={genGroupId} onChange={e => setGenGroupId(e.target.value)}>
                                    <option value="">No group</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <div className="gen-divider" />
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Passphrase <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                                <div className="pass-field-wrap">
                                    <input type={showPassphrase ? 'text' : 'password'} className="input-field pass-input" placeholder="Enter passphrase" value={genPassphrase} onChange={e => setGenPassphrase(e.target.value)} />
                                    <button type="button" className="pass-toggle" onClick={() => setShowPassphrase(!showPassphrase)}>
                                        {showPassphrase ? '🙈' : '👁'}
                                    </button>
                                </div>
                            </div>
                            <div className="toggle-row">
                                <span className="toggle-label">Save passphrase</span>
                                <button type="button" className={`toggle-switch ${genSavePassphrase ? 'toggle-on' : ''}`} onClick={() => setGenSavePassphrase(!genSavePassphrase)}>
                                    <span className="toggle-knob" />
                                </button>
                            </div>
                            <span className="gen-hint" style={{ marginBottom: 16, display: 'block' }}>
                                {genSavePassphrase ? 'Passphrase will be encrypted and stored for auto-connect' : 'You will be prompted for passphrase each time'}
                            </span>
                            <button type="submit" className="btn btn-primary gen-submit" disabled={submitting}>{submitting ? <span className="spinner" /> : 'Generate & Save'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUpload && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
                    <div className="modal">
                        <h2>Upload SSH Key</h2>
                        <form onSubmit={handleUpload}>
                            <div className="input-group" style={{ marginBottom: 16 }}><label>Key Name</label><input className="input-field" placeholder="My Key" value={uploadName} onChange={e => setUploadName(e.target.value)} required /></div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Public Key <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(Optional — derived automatically)</span></label>
                                <textarea className="input-field" rows={3} placeholder="ssh-rsa AAAA..." value={uploadPublic} onChange={e => setUploadPublic(e.target.value)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, resize: 'vertical' }} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <span>Private Key</span>
                                    <label style={{ cursor: 'pointer', color: 'var(--accent-primary)', fontWeight: 500, fontSize: 11, background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: 4 }}>
                                        Upload .pem file
                                        <input type="file" accept=".pem,.key" style={{ display: 'none' }} onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (evt) => { setUploadPrivate(evt.target.result); if (!uploadName) setUploadName(file.name.replace(/\.(pem|key)$/i, '')); };
                                                reader.readAsText(file);
                                            }
                                        }} />
                                    </label>
                                </label>
                                <textarea className="input-field" rows={4} placeholder="-----BEGIN PRIVATE KEY-----" value={uploadPrivate} onChange={e => setUploadPrivate(e.target.value)} required style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, resize: 'vertical', marginTop: 4 }} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Passphrase <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(if key is encrypted)</span></label>
                                <input type="password" className="input-field" placeholder="Leave empty if no passphrase" value={uploadPassphrase} onChange={e => setUploadPassphrase(e.target.value)} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Group <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                                <select className="input-field" value={uploadGroupId} onChange={e => setUploadGroupId(e.target.value)}>
                                    <option value="">No group</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? <span className="spinner" /> : 'Upload'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Export Modal */}
            {showExport && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowExport(null)}>
                    <div className="modal">
                        <h2>Export Key to Host</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
                            This copies the public key of <strong style={{ color: 'var(--text-accent)' }}>{showExport.name}</strong> to the remote host's <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>~/.ssh/authorized_keys</code>
                        </p>
                        <form onSubmit={handleExport}>
                            <div className="input-group" style={{ marginBottom: 14 }}>
                                <label>Target Host</label>
                                <select className="input-field" value={exportHostId} onChange={e => setExportHostId(e.target.value)} required>
                                    <option value="">Select host...</option>
                                    {hosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.username}@{h.hostname})</option>)}
                                </select>
                            </div>
                            <div className="input-group" style={{ marginBottom: 14 }}>
                                <label>Host Password <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(if password auth needed)</span></label>
                                <input type="password" className="input-field" placeholder="Password to login to host" value={exportPassword} onChange={e => setExportPassword(e.target.value)} />
                            </div>
                            <div className="input-group" style={{ marginBottom: 14 }}>
                                <label>Key Passphrase <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(if existing key is encrypted)</span></label>
                                <input type="password" className="input-field" placeholder="Passphrase for existing auth key" value={exportPassphrase} onChange={e => setExportPassphrase(e.target.value)} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowExport(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting || !exportHostId}>{submitting ? <span className="spinner" /> : 'Export Key'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Key Detail Modal */}
            {viewKey && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewKey(null)}>
                    <div className="modal" style={{ maxWidth: 580 }}>
                        <div className="gen-modal-header"><h2>{viewKey.name}</h2><button type="button" className="gen-close" onClick={() => setViewKey(null)}>✕</button></div>
                        <div className="detail-meta">
                            <span className={`badge ${viewKey.key_type?.includes('ed25519') ? 'badge-info' : viewKey.key_type?.includes('ecdsa') ? 'badge-warning' : 'badge-success'}`}>{viewKey.key_type?.toUpperCase()}</span>
                            <span className="detail-date">Created {new Date(viewKey.created_at).toLocaleDateString()}</span>
                            {viewKey.has_passphrase && <span className="badge badge-warning">🔒 Passphrase Protected</span>}
                        </div>
                        <div className="detail-section">
                            <div className="detail-section-header">
                                <label>Public Key</label>
                                <div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => downloadKey(viewKey.public_key, `${viewKey.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pub`)} style={{ marginRight: 8 }}>Download</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => copyField(viewKey.public_key, 'pub')}>{copiedField === 'pub' ? '✓ Copied' : 'Copy'}</button>
                                </div>
                            </div>
                            <pre className="detail-pre">{viewKey.public_key}</pre>
                        </div>
                        {viewKey.private_key && (
                            <div className="detail-section">
                                <div className="detail-section-header">
                                    <label>Private Key</label>
                                    <div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => downloadKey(viewKey.private_key, `${viewKey.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pem`)} style={{ marginRight: 8 }}>Download</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => copyField(viewKey.private_key, 'priv')}>{copiedField === 'priv' ? '✓ Copied' : 'Copy'}</button>
                                    </div>
                                </div>
                                <pre className="detail-pre detail-pre-private">{viewKey.private_key}</pre>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Group Create/Edit Modal */}
            {showGroupModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowGroupModal(false)}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2>{editGroup ? 'Edit Group' : 'New Key Group'}</h2>
                        <form onSubmit={handleGroupSubmit}>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Group Name</label>
                                <input className="input-field" placeholder="e.g. AWS Keys" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} required />
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

            {/* Delete Key Confirm */}
            {deleteConfirmId && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteConfirmId(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Delete Key?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>This action cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => deleteKey(deleteConfirmId)}>Delete</button>
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
                            Keys in this group will become ungrouped. This action cannot be undone.
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
