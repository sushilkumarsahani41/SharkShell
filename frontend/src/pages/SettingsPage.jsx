import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../api';

function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pw = '';
    const rand = new Uint32Array(14);
    crypto.getRandomValues(rand);
    rand.forEach(n => { pw += chars[n % chars.length]; });
    return pw;
}

// ─── Two-factor authentication card ───

function TwoFactorCard() {
    const { user, token, refreshUser } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [enrollment, setEnrollment] = useState(null); // { secret, qrDataUrl }
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState(null);
    const [disablePassword, setDisablePassword] = useState('');
    const [showDisable, setShowDisable] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(false);

    async function api(path, body) {
        const res = await fetch(apiUrl(path), { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data;
    }

    async function handleStart() {
        setMsg(null);
        setBusy(true);
        try {
            setEnrollment(await api('/api/auth/2fa/setup'));
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    async function handleEnable(e) {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            const data = await api('/api/auth/2fa/enable', { code });
            setRecoveryCodes(data.recoveryCodes);
            setEnrollment(null);
            setCode('');
            await refreshUser();
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    async function handleDisable(e) {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            await api('/api/auth/2fa/disable', { password: disablePassword });
            setShowDisable(false);
            setDisablePassword('');
            setMsg({ type: 'success', text: 'Two-factor authentication disabled' });
            await refreshUser();
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="settings-section glass-card" style={{ marginTop: 20 }}>
            <div className="settings-section-header">
                <div className="settings-section-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
                <div>
                    <h2>Two-factor authentication {user?.totp_enabled
                        ? <span className="role-badge role-badge-admin" style={{ marginLeft: 6 }}>enabled</span>
                        : <span className="role-badge" style={{ marginLeft: 6 }}>off</span>}</h2>
                    <p>Require a code from an authenticator app (Google Authenticator, Authy, 1Password…) when signing in.</p>
                </div>
            </div>

            {msg && <div className={msg.type === 'error' ? 'auth-error' : 'auth-success'} style={{ marginBottom: 14 }}>{msg.text}</div>}

            {recoveryCodes && (
                <div className="glass-card mcp-new-key" style={{ marginBottom: 14 }}>
                    <div className="mcp-new-key-header">
                        <strong>Save your recovery codes</strong>
                        <span>Each works once if you lose your authenticator. They are shown only now.</span>
                    </div>
                    <div className="recovery-grid">
                        {recoveryCodes.map(c => <code key={c}>{c}</code>)}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}>Copy all</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRecoveryCodes(null)}>I saved them</button>
                    </div>
                </div>
            )}

            {!user?.totp_enabled && !enrollment && (
                <button className="btn btn-primary" onClick={handleStart} disabled={busy}>
                    {busy ? <span className="spinner" /> : 'Enable 2FA'}
                </button>
            )}

            {enrollment && (
                <div className="twofa-enroll">
                    <div className="twofa-qr">
                        <img src={enrollment.qrDataUrl} alt="Scan with your authenticator app" width="180" height="180" />
                    </div>
                    <div className="twofa-steps">
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            1. Scan the QR code with your authenticator app, or enter this key manually:
                        </p>
                        <div className="mcp-key-reveal">
                            <code>{enrollment.secret}</code>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(enrollment.secret)}>Copy</button>
                        </div>
                        <form onSubmit={handleEnable}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>2. Enter the 6-digit code it shows:</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="input-field" style={{ maxWidth: 160, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2 }}
                                    placeholder="000000" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" pattern="[0-9 ]*" required autoFocus />
                                <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/\s/g, '').length !== 6}>Confirm</button>
                                <button type="button" className="btn btn-ghost" onClick={() => { setEnrollment(null); setCode(''); }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {user?.totp_enabled && !showDisable && (
                <button className="btn btn-ghost" onClick={() => setShowDisable(true)}>Disable 2FA</button>
            )}

            {showDisable && (
                <form onSubmit={handleDisable} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ maxWidth: 260 }}>
                        <label>Confirm with your password</label>
                        <input type="password" className="input-field" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} required autoFocus />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy}>Disable</button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setShowDisable(false); setDisablePassword(''); }}>Cancel</button>
                </form>
            )}
        </div>
    );
}

// ─── Account tab ───

function AccountTab() {
    const { user, changePassword } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [msg, setMsg] = useState(null); // { type, text }
    const [saving, setSaving] = useState(false);

    async function handleChangePassword(e) {
        e.preventDefault();
        setMsg(null);
        if (newPassword !== confirm) {
            setMsg({ type: 'error', text: 'New passwords do not match' });
            return;
        }
        setSaving(true);
        try {
            await changePassword(currentPassword, newPassword);
            setMsg({ type: 'success', text: 'Password updated' });
            setCurrentPassword(''); setNewPassword(''); setConfirm('');
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
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
                    <div className="settings-field"><span className="settings-field-label">Role</span><span className={`role-badge role-badge-${user?.role}`}>{user?.role || 'member'}</span></div>
                    {user?.created_at && (
                        <div className="settings-field"><span className="settings-field-label">Member since</span><span>{new Date(user.created_at).toLocaleDateString()}</span></div>
                    )}
                </div>
            </div>

            <div className="settings-section glass-card" style={{ marginTop: 20 }}>
                <div className="settings-section-header">
                    <div className="settings-section-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <div>
                        <h2>Change password</h2>
                        <p>Use at least 8 characters.</p>
                    </div>
                </div>
                <form onSubmit={handleChangePassword} className="settings-form">
                    {msg && <div className={msg.type === 'error' ? 'auth-error' : 'auth-success'}>{msg.text}</div>}
                    <div className="input-group">
                        <label>Current password</label>
                        <input type="password" className="input-field" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                    </div>
                    <div className="settings-form-row">
                        <div className="input-group">
                            <label>New password</label>
                            <input type="password" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
                        </div>
                        <div className="input-group">
                            <label>Confirm new password</label>
                            <input type="password" className="input-field" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                        </div>
                    </div>
                    <div>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? <span className="spinner" /> : 'Update password'}
                        </button>
                    </div>
                </form>
            </div>

            <TwoFactorCard />
        </>
    );
}

// ─── Organization tab (admin) ───

function OrganizationTab() {
    const { user, token } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [org, setOrg] = useState(null);
    const [orgName, setOrgName] = useState('');
    const [members, setMembers] = useState([]);
    const [msg, setMsg] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', password: generatePassword(), role: 'member' });
    const [createdCreds, setCreatedCreds] = useState(null); // { email, password }
    const [resetCreds, setResetCreds] = useState(null); // { email, password }
    const [busy, setBusy] = useState(false);

    useEffect(() => { load(); }, []);

    async function load() {
        try {
            const [orgRes, usersRes] = await Promise.all([
                fetch(apiUrl('/api/org'), { headers }),
                fetch(apiUrl('/api/org/users'), { headers }),
            ]);
            if (orgRes.ok) { const o = await orgRes.json(); setOrg(o); setOrgName(o.name); }
            if (usersRes.ok) { const d = await usersRes.json(); setMembers(d.users || []); }
        } catch { }
    }

    async function api(path, options, successMsg) {
        setMsg(null);
        setBusy(true);
        try {
            const res = await fetch(apiUrl(path), { headers, ...options });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            if (successMsg) setMsg({ type: 'success', text: successMsg });
            await load();
            return data;
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function handleRename(e) {
        e.preventDefault();
        if (orgName.trim() && orgName.trim() !== org?.name) {
            await api('/api/org', { method: 'PATCH', body: JSON.stringify({ name: orgName }) }, 'Organization renamed');
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        const data = await api('/api/org/users', { method: 'POST', body: JSON.stringify(newMember) }, null);
        if (data) {
            setCreatedCreds({ email: newMember.email, password: newMember.password });
            setNewMember({ name: '', email: '', password: generatePassword(), role: 'member' });
            setShowAdd(false);
        }
    }

    async function handleResetPassword(member) {
        const password = generatePassword();
        const data = await api(`/api/org/users/${member.id}`, { method: 'PATCH', body: JSON.stringify({ password }) }, null);
        if (data) setResetCreds({ email: member.email, password });
    }

    async function handleDelete(member) {
        if (!window.confirm(`Delete ${member.email}? Their hosts, keys, and groups will be permanently removed.`)) return;
        await api(`/api/org/users/${member.id}`, { method: 'DELETE' }, `${member.email} deleted`);
    }

    function CredsBanner({ creds, onDismiss }) {
        return (
            <div className="glass-card mcp-new-key">
                <div className="mcp-new-key-header">
                    <strong>Temporary password for {creds.email}</strong>
                    <span>Share it securely — it is shown only once. They'll be asked to set their own password on first sign-in.</span>
                </div>
                <div className="mcp-key-reveal">
                    <code>{creds.password}</code>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(creds.password)}>Copy</button>
                    <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
                </div>
            </div>
        );
    }

    return (
        <>
            {msg && <div className={msg.type === 'error' ? 'auth-error' : 'auth-success'} style={{ marginBottom: 16 }}>{msg.text}</div>}
            {createdCreds && <CredsBanner creds={createdCreds} onDismiss={() => setCreatedCreds(null)} />}
            {resetCreds && <CredsBanner creds={resetCreds} onDismiss={() => setResetCreds(null)} />}

            <div className="settings-section glass-card">
                <div className="settings-section-header">
                    <div className="settings-section-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>
                    <div>
                        <h2>Organization</h2>
                        <p>Members share this SharkShell instance. Each member's hosts and keys are private to them.</p>
                    </div>
                </div>
                <form onSubmit={handleRename} className="settings-form-row" style={{ alignItems: 'flex-end', marginBottom: 20 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>Organization name</label>
                        <input className="input-field" value={orgName} onChange={e => setOrgName(e.target.value)} />
                    </div>
                    <button type="submit" className="btn btn-ghost" disabled={busy || !orgName.trim() || orgName.trim() === org?.name}>Rename</button>
                </form>

                <div className="mcp-audit-header">
                    <h3>Members ({members.length})</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add member</button>
                </div>
                <div className="mcp-audit-scroll">
                    <table className="mcp-audit-table">
                        <thead>
                            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr>
                        </thead>
                        <tbody>
                            {members.map(m => (
                                <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                                    <td>{m.name}{m.id === user?.id && <span className="member-you"> (you)</span>}</td>
                                    <td>{m.email}</td>
                                    <td><span className={`role-badge role-badge-${m.role}`}>{m.role}</span></td>
                                    <td>
                                        {m.is_active ? (m.must_change_password ? 'Pending first login' : 'Active') : 'Deactivated'}
                                        {m.totp_enabled && <span title="Two-factor authentication enabled"> · 2FA</span>}
                                    </td>
                                    <td>{new Date(m.created_at).toLocaleDateString()}</td>
                                    <td>
                                        {m.id !== user?.id && (
                                            <div className="member-actions">
                                                <button className="btn btn-ghost btn-sm" disabled={busy} title={m.role === 'admin' ? 'Make member' : 'Make admin'}
                                                    onClick={() => api(`/api/org/users/${m.id}`, { method: 'PATCH', body: JSON.stringify({ role: m.role === 'admin' ? 'member' : 'admin' }) }, 'Role updated')}>
                                                    {m.role === 'admin' ? '↓ Member' : '↑ Admin'}
                                                </button>
                                                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleResetPassword(m)}>Reset&nbsp;pw</button>
                                                {m.totp_enabled && (
                                                    <button className="btn btn-ghost btn-sm" disabled={busy} title="For a member who lost their authenticator device"
                                                        onClick={() => window.confirm(`Remove 2FA from ${m.email}? They can re-enable it in their settings.`) && api(`/api/org/users/${m.id}`, { method: 'PATCH', body: JSON.stringify({ reset_2fa: true }) }, '2FA reset')}>
                                                        Reset&nbsp;2FA
                                                    </button>
                                                )}
                                                <button className="btn btn-ghost btn-sm" disabled={busy}
                                                    onClick={() => api(`/api/org/users/${m.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !m.is_active }) }, m.is_active ? 'Member deactivated' : 'Member reactivated')}>
                                                    {m.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                                <button className="btn btn-ghost btn-sm btn-danger-text" disabled={busy} onClick={() => handleDelete(m)}>Delete</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAdd && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
                    <div className="modal" style={{ maxWidth: 440 }}>
                        <h2>Add member</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                            The member signs in with this temporary password and must set their own on first login.
                        </p>
                        <form onSubmit={handleCreate}>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Name</label>
                                <input className="input-field" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} required autoFocus />
                            </div>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Email</label>
                                <input type="email" className="input-field" value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} required />
                            </div>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Temporary password</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input-field" style={{ fontFamily: 'JetBrains Mono, monospace' }} value={newMember.password} onChange={e => setNewMember({ ...newMember, password: e.target.value })} required minLength={8} />
                                    <button type="button" className="btn btn-ghost" onClick={() => setNewMember({ ...newMember, password: generatePassword() })}>↻</button>
                                </div>
                            </div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Role</label>
                                <select className="input-field" value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })}>
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={busy}>Create member</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Email / SMTP tab (admin) ───

function EmailTab() {
    const { token } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [form, setForm] = useState({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: 'SharkShell' });
    const [hasPassword, setHasPassword] = useState(false);
    const [configured, setConfigured] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(apiUrl('/api/org/smtp'), { headers });
                if (res.ok) {
                    const data = await res.json();
                    setConfigured(data.configured);
                    if (data.config) {
                        const { hasPassword: hp, ...rest } = data.config;
                        setForm(f => ({ ...f, ...rest, password: '' }));
                        setHasPassword(hp);
                    }
                }
            } catch { }
        })();
    }, []);

    async function handleSave(e) {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        try {
            const res = await fetch(apiUrl('/api/org/smtp'), { method: 'PUT', headers, body: JSON.stringify(form) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setConfigured(true);
            if (form.password) setHasPassword(true);
            setForm(f => ({ ...f, password: '' }));
            setMsg({ type: 'success', text: 'SMTP settings saved' });
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    async function handleTest() {
        setMsg(null);
        setBusy(true);
        try {
            const res = await fetch(apiUrl('/api/org/smtp/test'), { method: 'POST', headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMsg({ type: 'success', text: data.message });
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="settings-section glass-card">
            <div className="settings-section-header">
                <div className="settings-section-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                    </svg>
                </div>
                <div>
                    <h2>Email (SMTP) {configured ? <span className="role-badge role-badge-admin" style={{ marginLeft: 6 }}>configured</span> : <span className="role-badge" style={{ marginLeft: 6 }}>not configured</span>}</h2>
                    <p>Used for "forgot password" reset emails. Credentials are stored AES-256 encrypted.</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="settings-form">
                {msg && <div className={msg.type === 'error' ? 'auth-error' : 'auth-success'}>{msg.text}</div>}
                <div className="settings-form-row">
                    <div className="input-group" style={{ flex: 2 }}>
                        <label>SMTP host</label>
                        <input className="input-field" placeholder="smtp.example.com" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} required />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>Port</label>
                        <input type="number" className="input-field" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} required />
                    </div>
                </div>
                <label className="mcp-checkline">
                    <input type="checkbox" checked={form.secure} onChange={e => setForm({ ...form, secure: e.target.checked })} />
                    Use TLS/SSL (implicit — usually port 465; leave off for STARTTLS on 587)
                </label>
                <div className="settings-form-row">
                    <div className="input-group">
                        <label>Username</label>
                        <input className="input-field" placeholder="smtp user (optional)" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" className="input-field" placeholder={hasPassword ? '•••••••• (unchanged)' : 'smtp password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                    </div>
                </div>
                <div className="settings-form-row">
                    <div className="input-group">
                        <label>From email</label>
                        <input type="email" className="input-field" placeholder="sharkshell@example.com" value={form.fromEmail} onChange={e => setForm({ ...form, fromEmail: e.target.value })} required />
                    </div>
                    <div className="input-group">
                        <label>From name</label>
                        <input className="input-field" value={form.fromName} onChange={e => setForm({ ...form, fromName: e.target.value })} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? <span className="spinner" /> : 'Save settings'}
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={busy || !configured} onClick={handleTest} title="Verifies the connection and emails you">
                        Send test email
                    </button>
                </div>
            </form>
        </div>
    );
}

// ─── Backup tab (admin) ───

const BACKUP_TYPES = [
    { id: 'local', label: 'Local disk' },
    { id: 's3', label: 'Amazon S3 / S3-compatible' },
    { id: 'gcs', label: 'Google Cloud Storage' },
    { id: 'sftp', label: 'SFTP' },
    { id: 'ftp', label: 'FTP' },
    { id: 'webdav', label: 'WebDAV' },
];

const CRON_PRESETS = [
    { label: 'Daily at 2am', value: '0 2 * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Weekly (Sun 2am)', value: '0 2 * * 0' },
];

const emptyDestForm = {
    name: '', type: 'local',
    config: { accessKeyId: '', secretAccessKey: '', region: '', bucket: '', endpoint: '', serviceAccountJson: '', host: '', port: '', username: '', password: '', useTls: false, url: '', vendor: 'other', path: '' },
    scheduleEnabled: false, cronExpression: '0 2 * * *', retentionCount: 7,
};

function formatBytes(n) {
    if (n === null || n === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = Number(n);
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function BackupTab() {
    const { token } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [destinations, setDestinations] = useState([]);
    const [runs, setRuns] = useState([]);
    const [rcloneAvailable, setRcloneAvailable] = useState(true);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editDest, setEditDest] = useState(null);
    const [form, setForm] = useState(emptyDestForm);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmRestore, setConfirmRestore] = useState(null); // run object
    const [restorePhrase, setRestorePhrase] = useState('');
    const [restoring, setRestoring] = useState(false); // true while waiting for the service to restart
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadPhrase, setUploadPhrase] = useState('');

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const [d, r, s] = await Promise.all([
                fetch(apiUrl('/api/backup/destinations'), { headers }),
                fetch(apiUrl('/api/backup/runs'), { headers }),
                fetch(apiUrl('/api/backup/rclone-status'), { headers }),
            ]);
            if (d.ok) setDestinations((await d.json()).destinations || []);
            if (r.ok) setRuns((await r.json()).runs || []);
            if (s.ok) setRcloneAvailable((await s.json()).available);
        } catch { } finally { setLoading(false); }
    }

    async function api(path, options, successMsg) {
        setMsg(null);
        setBusy(true);
        try {
            const res = await fetch(apiUrl(path), { headers, ...options });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            if (successMsg) setMsg({ type: 'success', text: successMsg });
            await load();
            return data;
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
            return null;
        } finally {
            setBusy(false);
        }
    }

    function openCreate() { setEditDest(null); setForm(emptyDestForm); setShowModal(true); }
    function openEdit(d) {
        setEditDest(d);
        setForm({
            name: d.name, type: d.type,
            config: { ...emptyDestForm.config }, // secrets never come back from the API — re-enter to change
            scheduleEnabled: d.schedule_enabled, cronExpression: d.cron_expression || '0 2 * * *',
            retentionCount: d.retention_count,
        });
        setShowModal(true);
    }

    async function submitDest(e) {
        e.preventDefault();
        const payload = {
            name: form.name, type: form.type, config: form.config,
            scheduleEnabled: form.scheduleEnabled, cronExpression: form.cronExpression,
            retentionCount: Number(form.retentionCount) || 7,
        };
        const url = editDest ? `/api/backup/destinations/${editDest.id}` : '/api/backup/destinations';
        const data = await api(url, { method: editDest ? 'PUT' : 'POST', body: JSON.stringify(payload) }, editDest ? 'Destination updated' : 'Destination created');
        if (data) setShowModal(false);
    }

    async function runNow(d) { await api(`/api/backup/destinations/${d.id}/run`, { method: 'POST' }, `Backup started for "${d.name}"`); }
    async function deleteDest(d) { await api(`/api/backup/destinations/${d.id}`, { method: 'DELETE' }, `"${d.name}" deleted`); setConfirmDelete(null); }

    async function doRestore(run) {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch(apiUrl(`/api/backup/runs/${run.id}/restore`), {
                method: 'POST', headers, body: JSON.stringify({ confirmationPhrase: 'RESTORE' }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Restore failed');
            setConfirmRestore(null);
            setRestorePhrase('');
            setRestoring(true);
            waitForReconnect();
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    function waitForReconnect() {
        const check = () => {
            fetch(apiUrl('/api/health')).then(res => {
                if (res.ok) window.location.reload();
                else setTimeout(check, 1500);
            }).catch(() => setTimeout(check, 1500));
        };
        setTimeout(check, 1500); // give the process a moment to actually exit before polling
    }

    async function doUploadRestore() {
        if (!uploadFile) return;
        setBusy(true);
        setMsg(null);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('confirmationPhrase', 'RESTORE');
            const res = await fetch(apiUrl('/api/backup/restore-upload'), {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Restore failed');
            setShowUploadModal(false);
            setUploadFile(null);
            setUploadPhrase('');
            setRestoring(true);
            waitForReconnect();
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    function scheduleSummary(d) {
        if (!d.schedule_enabled) return 'Manual only';
        const preset = CRON_PRESETS.find(p => p.value === d.cron_expression);
        return preset ? preset.label : d.cron_expression;
    }

    return (
        <>
            {msg && <div className={msg.type === 'error' ? 'auth-error' : 'auth-success'} style={{ marginBottom: 16 }}>{msg.text}</div>}
            {!rcloneAvailable && (
                <div className="auth-error" style={{ marginBottom: 16 }}>
                    rclone isn't available in this container — only the "Local disk" destination will work until the image includes it.
                </div>
            )}

            <div className="settings-section glass-card">
                <div className="settings-section-header">
                    <div className="settings-section-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                        </svg>
                    </div>
                    <div>
                        <h2>Backup destinations</h2>
                        <p>Encrypted, scheduled backups of your database and secrets — local disk, S3, Google Cloud Storage, SFTP, FTP, or WebDAV.</p>
                    </div>
                </div>

                <div className="mcp-audit-header">
                    <h3>Destinations ({destinations.length})</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add destination</button>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner spinner-lg" /></div>
                ) : destinations.length === 0 ? (
                    <p className="mcp-audit-empty">No backup destinations yet. Add one to start protecting your data.</p>
                ) : (
                    <div className="mcp-key-list">
                        {destinations.map(d => (
                            <div key={d.id} className="mcp-key-card glass-card">
                                <div className="mcp-key-card-main">
                                    <div className="mcp-key-card-title">
                                        <span className="mcp-key-card-label">{d.name}</span>
                                        <span className="badge badge-info">{BACKUP_TYPES.find(t => t.id === d.type)?.label || d.type}</span>
                                        <span className={`badge ${d.schedule_enabled ? 'badge-success' : 'badge-warning'}`}>{scheduleSummary(d)}</span>
                                        {!d.is_active && <span className="badge badge-danger">Disabled</span>}
                                    </div>
                                    <div className="mcp-key-card-meta">
                                        <span>Retention: last {d.retention_count}</span>
                                        <span>Last run: {d.last_run_at ? new Date(d.last_run_at).toLocaleString() : 'never'}</span>
                                    </div>
                                </div>
                                <div className="mcp-key-card-actions">
                                    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runNow(d)}>Run now</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>Edit</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(d)}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="settings-section glass-card" style={{ marginTop: 20 }}>
                <div className="mcp-audit-header">
                    <h3>Restore from an uploaded file</h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                    Move a backup between instances — download a <code className="mcp-inline-code">.tar.gz.enc</code> file
                    from another SharkShell's backup history, then upload it here. Only works if this instance's
                    current encryption key matches the one that made the backup.
                </p>
                <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}>Upload backup file…</button>
            </div>

            <div className="settings-section glass-card" style={{ marginTop: 20 }}>
                <div className="mcp-audit-header">
                    <h3>Backup history</h3>
                    <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
                </div>
                {runs.length === 0 ? (
                    <p className="mcp-audit-empty">No backups run yet.</p>
                ) : (
                    <div className="mcp-audit-scroll">
                        <table className="mcp-audit-table">
                            <thead><tr><th>Started</th><th>Destination</th><th>Trigger</th><th>Size</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                                {runs.map(r => (
                                    <tr key={r.id}>
                                        <td>{new Date(r.started_at).toLocaleString()}</td>
                                        <td>{r.destination_name}</td>
                                        <td>{r.triggered_by}</td>
                                        <td>{formatBytes(r.size_bytes)}</td>
                                        <td>
                                            <span className={`mcp-status mcp-status-${r.status === 'success' ? 'success' : r.status === 'running' ? 'denied' : 'error'}`}>{r.status}</span>
                                            {r.error && <span title={r.error}> ⚠️</span>}
                                        </td>
                                        <td>
                                            {r.status === 'success' && r.destination_type === 'local' && (
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <a className="btn btn-ghost btn-sm" href={apiUrl(`/api/backup/runs/${r.id}/download`)} onClick={(e) => {
                                                        e.preventDefault();
                                                        fetch(apiUrl(`/api/backup/runs/${r.id}/download`), { headers })
                                                            .then(res => res.blob())
                                                            .then(blob => {
                                                                const url = URL.createObjectURL(blob);
                                                                const a = document.createElement('a');
                                                                a.href = url; a.download = r.file_name || 'backup.tar.gz.enc'; a.click();
                                                                URL.revokeObjectURL(url);
                                                            });
                                                    }}>Download</a>
                                                    <button className="btn btn-ghost btn-sm btn-danger-text" onClick={() => { setConfirmRestore(r); setRestorePhrase(''); }}>Restore</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create / Edit modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <h2>{editDest ? 'Edit destination' : 'Add backup destination'}</h2>
                        <form onSubmit={submitDest}>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Name</label>
                                <input className="input-field" placeholder="e.g. Nightly S3 backup" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
                            </div>

                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Destination type</label>
                                <select className="input-field" value={form.type} disabled={!!editDest} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    {BACKUP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                                {editDest && <p className="mcp-note" style={{ marginTop: 6 }}>Type can't be changed after creation — create a new destination instead.</p>}
                            </div>

                            {editDest && form.type !== 'local' && (
                                <p className="mcp-note" style={{ marginBottom: 12 }}>Credential fields are blank for security — leave them blank to keep the stored values, or fill them in to replace.</p>
                            )}

                            {form.type === 's3' && (
                                <>
                                    <div className="settings-form-row">
                                        <div className="input-group"><label>Access key ID</label><input className="input-field" value={form.config.accessKeyId} onChange={e => setForm({ ...form, config: { ...form.config, accessKeyId: e.target.value } })} autoComplete="off" /></div>
                                        <div className="input-group"><label>Secret access key</label><input type="password" className="input-field" value={form.config.secretAccessKey} onChange={e => setForm({ ...form, config: { ...form.config, secretAccessKey: e.target.value } })} autoComplete="new-password" /></div>
                                    </div>
                                    <div className="settings-form-row">
                                        <div className="input-group"><label>Bucket</label><input className="input-field" value={form.config.bucket} onChange={e => setForm({ ...form, config: { ...form.config, bucket: e.target.value } })} required /></div>
                                        <div className="input-group"><label>Region</label><input className="input-field" placeholder="us-east-1" value={form.config.region} onChange={e => setForm({ ...form, config: { ...form.config, region: e.target.value } })} /></div>
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 12 }}>
                                        <label>Custom endpoint (optional)</label>
                                        <input className="input-field" placeholder="For MinIO, R2, Backblaze B2, Wasabi, DO Spaces…" value={form.config.endpoint} onChange={e => setForm({ ...form, config: { ...form.config, endpoint: e.target.value } })} />
                                    </div>
                                </>
                            )}

                            {form.type === 'gcs' && (
                                <>
                                    <div className="input-group" style={{ marginBottom: 12 }}>
                                        <label>Bucket</label>
                                        <input className="input-field" value={form.config.bucket} onChange={e => setForm({ ...form, config: { ...form.config, bucket: e.target.value } })} required />
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 12 }}>
                                        <label>Service account JSON key</label>
                                        <textarea className="input-field" rows={5} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} placeholder="Paste the full JSON key file contents" value={form.config.serviceAccountJson} onChange={e => setForm({ ...form, config: { ...form.config, serviceAccountJson: e.target.value } })} />
                                    </div>
                                </>
                            )}

                            {(form.type === 'sftp' || form.type === 'ftp') && (
                                <>
                                    <div className="settings-form-row">
                                        <div className="input-group" style={{ flex: 2 }}><label>Host</label><input className="input-field" value={form.config.host} onChange={e => setForm({ ...form, config: { ...form.config, host: e.target.value } })} required /></div>
                                        <div className="input-group"><label>Port</label><input type="number" className="input-field" placeholder={form.type === 'sftp' ? '22' : '21'} value={form.config.port} onChange={e => setForm({ ...form, config: { ...form.config, port: e.target.value } })} /></div>
                                    </div>
                                    <div className="settings-form-row">
                                        <div className="input-group"><label>Username</label><input className="input-field" value={form.config.username} onChange={e => setForm({ ...form, config: { ...form.config, username: e.target.value } })} autoComplete="off" /></div>
                                        <div className="input-group"><label>Password</label><input type="password" className="input-field" value={form.config.password} onChange={e => setForm({ ...form, config: { ...form.config, password: e.target.value } })} autoComplete="new-password" /></div>
                                    </div>
                                    {form.type === 'ftp' && (
                                        <label className="mcp-checkline" style={{ marginBottom: 12 }}>
                                            <input type="checkbox" checked={form.config.useTls} onChange={e => setForm({ ...form, config: { ...form.config, useTls: e.target.checked } })} />
                                            <span>Use explicit TLS (FTPS)</span>
                                        </label>
                                    )}
                                </>
                            )}

                            {form.type === 'webdav' && (
                                <>
                                    <div className="input-group" style={{ marginBottom: 12 }}>
                                        <label>Server URL</label>
                                        <input className="input-field" placeholder="https://cloud.example.com/remote.php/dav/files/user" value={form.config.url} onChange={e => setForm({ ...form, config: { ...form.config, url: e.target.value } })} required />
                                    </div>
                                    <div className="settings-form-row">
                                        <div className="input-group">
                                            <label>Vendor</label>
                                            <select className="input-field" value={form.config.vendor} onChange={e => setForm({ ...form, config: { ...form.config, vendor: e.target.value } })}>
                                                <option value="nextcloud">Nextcloud</option>
                                                <option value="owncloud">ownCloud</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                        <div className="input-group"><label>Username</label><input className="input-field" value={form.config.username} onChange={e => setForm({ ...form, config: { ...form.config, username: e.target.value } })} autoComplete="off" /></div>
                                        <div className="input-group"><label>Password</label><input type="password" className="input-field" value={form.config.password} onChange={e => setForm({ ...form, config: { ...form.config, password: e.target.value } })} autoComplete="new-password" /></div>
                                    </div>
                                </>
                            )}

                            {form.type !== 'local' && (
                                <div className="input-group" style={{ marginBottom: 16 }}>
                                    <label>Path / prefix (optional)</label>
                                    <input className="input-field" placeholder="e.g. sharkshell-backups" value={form.config.path} onChange={e => setForm({ ...form, config: { ...form.config, path: e.target.value } })} />
                                </div>
                            )}

                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Retention</label>
                                <input type="number" min={1} className="input-field" style={{ maxWidth: 140 }} value={form.retentionCount} onChange={e => setForm({ ...form, retentionCount: e.target.value })} />
                                <p className="mcp-note" style={{ marginTop: 6 }}>Keep the last N successful backups; older ones are deleted automatically.</p>
                            </div>

                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label className="mcp-checkline">
                                    <input type="checkbox" checked={form.scheduleEnabled} onChange={e => setForm({ ...form, scheduleEnabled: e.target.checked })} />
                                    <span>Run automatically on a schedule</span>
                                </label>
                            </div>

                            {form.scheduleEnabled && (
                                <div className="input-group" style={{ marginBottom: 16 }}>
                                    <label>Cron expression</label>
                                    <input className="input-field" style={{ fontFamily: 'JetBrains Mono, monospace' }} value={form.cronExpression} onChange={e => setForm({ ...form, cronExpression: e.target.value })} required />
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                        {CRON_PRESETS.map(p => (
                                            <button type="button" key={p.value} className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, cronExpression: p.value })}>{p.label}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : (editDest ? 'Save' : 'Add destination')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {confirmDelete && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Delete “{confirmDelete.name}”?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>Its backup history is removed too. Files already uploaded to the destination are not deleted.</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={() => deleteDest(confirmDelete)} disabled={busy}>{busy ? <span className="spinner" /> : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restore confirm */}
            {confirmRestore && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRestore(null)}>
                    <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Restore this backup?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
                            This <strong>overwrites the entire live database</strong> with the state from {new Date(confirmRestore.started_at).toLocaleString()}.
                            Anything created or changed since then — hosts, keys, users, MCP keys, everything — is permanently lost. The service restarts automatically afterward.
                        </p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>This cannot be undone. Type <strong>RESTORE</strong> to confirm.</p>
                        <input className="input-field" style={{ textAlign: 'center', marginBottom: 20 }} value={restorePhrase} onChange={e => setRestorePhrase(e.target.value)} placeholder="RESTORE" autoFocus />
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmRestore(null)}>Cancel</button>
                            <button className="btn btn-danger" disabled={busy || restorePhrase !== 'RESTORE'} onClick={() => doRestore(confirmRestore)}>{busy ? <span className="spinner" /> : 'Restore & restart'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload & restore modal */}
            {showUploadModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowUploadModal(false)}>
                    <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Restore from an uploaded backup</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                            This <strong>overwrites the entire live database</strong> with whatever's in the uploaded file.
                            Anything on this instance not in that backup is permanently lost. The service restarts automatically afterward.
                        </p>
                        <div className="input-group" style={{ marginBottom: 16, textAlign: 'left' }}>
                            <label>Backup file (.tar.gz.enc)</label>
                            <input type="file" accept=".enc" className="input-field" onChange={e => setUploadFile(e.target.files[0] || null)} />
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>This cannot be undone. Type <strong>RESTORE</strong> to confirm.</p>
                        <input className="input-field" style={{ textAlign: 'center', marginBottom: 20 }} value={uploadPhrase} onChange={e => setUploadPhrase(e.target.value)} placeholder="RESTORE" />
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
                            <button className="btn btn-danger" disabled={busy || !uploadFile || uploadPhrase !== 'RESTORE'} onClick={doUploadRestore}>{busy ? <span className="spinner" /> : 'Restore & restart'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restoring overlay */}
            {restoring && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
                        <div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} />
                        <h2 style={{ marginBottom: 8 }}>Restoring &amp; restarting…</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>The service is applying the backup and will be back in a few seconds. This page will reload automatically.</p>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Page ───

export default function SettingsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [tab, setTab] = useState('account');

    const tabs = [
        { id: 'account', label: 'Account' },
        ...(isAdmin ? [
            { id: 'organization', label: 'Organization' },
            { id: 'email', label: 'Email (SMTP)' },
            { id: 'backup', label: 'Backup' },
        ] : []),
    ];

    return (
        <div>
            <div className="page-header">
                <div><h1>Settings</h1><p>Account, organization &amp; email preferences</p></div>
            </div>

            {tabs.length > 1 && (
                <div className="settings-tabs">
                    {tabs.map(t => (
                        <button key={t.id} className={`settings-tab ${tab === t.id ? 'settings-tab-active' : ''}`} onClick={() => setTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {tab === 'account' && <AccountTab />}
            {tab === 'organization' && isAdmin && <OrganizationTab />}
            {tab === 'email' && isAdmin && <EmailTab />}
            {tab === 'backup' && isAdmin && <BackupTab />}
        </div>
    );
}
