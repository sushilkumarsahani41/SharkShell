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
        </div>
    );
}
