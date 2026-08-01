import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../api';

const emptyScope = { capability: 'execute', scopeAll: true, allowedHostIds: [], allowedGroupIds: [] };

export default function OAuthConsentPage() {
    const { token, user } = useAuth();
    const [searchParams] = useSearchParams();

    const clientId = searchParams.get('client_id') || '';
    const redirectUri = searchParams.get('redirect_uri') || '';
    const codeChallenge = searchParams.get('code_challenge') || '';
    const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';
    const state = searchParams.get('state') || '';

    const [phase, setPhase] = useState('loading'); // loading | error | confirm | redirecting
    const [error, setError] = useState('');
    const [clientName, setClientName] = useState('');
    const [hosts, setHosts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [scope, setScope] = useState(emptyScope);
    const [submitting, setSubmitting] = useState(false);

    function authHeaders(json) { return json ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}` }; }
    function toggleId(list, id) { return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]; }

    useEffect(() => {
        if (!token) return;
        if (!clientId || !redirectUri || !codeChallenge) {
            setError('This connection request is missing required parameters. Ask the MCP client to try connecting again.');
            setPhase('error');
            return;
        }

        async function load() {
            try {
                const qs = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }).toString();
                const [infoRes, hostsRes, groupsRes] = await Promise.all([
                    fetch(apiUrl(`/api/oauth/authorize-info?${qs}`), { headers: authHeaders() }),
                    fetch(apiUrl('/api/hosts'), { headers: authHeaders() }),
                    fetch(apiUrl('/api/groups?type=host'), { headers: authHeaders() }),
                ]);
                if (!infoRes.ok) {
                    const data = await infoRes.json().catch(() => ({}));
                    setError(data.error_description || 'This connection request is invalid or has expired.');
                    setPhase('error');
                    return;
                }
                const info = await infoRes.json();
                setClientName(info.client_name || 'MCP Client');
                if (hostsRes.ok) setHosts((await hostsRes.json()).hosts || []);
                if (groupsRes.ok) setGroups((await groupsRes.json()).groups || []);
                setPhase('confirm');
            } catch {
                setError('Could not reach SharkShell to verify this request. Try again.');
                setPhase('error');
            }
        }
        load();
    }, [token, clientId, redirectUri, codeChallenge]);

    async function decide(approve) {
        setSubmitting(true);
        try {
            const payload = {
                clientId, redirectUri, codeChallenge, codeChallengeMethod, state, approve,
                capability: scope.capability,
                scopeAll: scope.scopeAll,
                allowedHostIds: scope.scopeAll ? [] : scope.allowedHostIds,
                allowedGroupIds: scope.scopeAll ? [] : scope.allowedGroupIds,
            };
            const res = await fetch(apiUrl('/api/oauth/authorize-info'), { method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok || !data.redirectUrl) {
                setError(data.error_description || 'Could not complete the connection.');
                setPhase('error');
                return;
            }
            setPhase('redirecting');
            window.location.href = data.redirectUrl;
        } catch (err) {
            setError(err.message);
            setPhase('error');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-bg">
                <div className="auth-orb auth-orb-1" />
                <div className="auth-orb auth-orb-2" />
                <div className="auth-orb auth-orb-3" />
            </div>

            <div className="auth-container">
                <div className="auth-card glass-card" style={{ maxWidth: 480 }}>
                    <div className="auth-logo">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <defs>
                                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <h1>SharkShell</h1>
                    </div>

                    {phase === 'loading' && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><div className="spinner spinner-lg" /></div>
                    )}

                    {phase === 'redirecting' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
                            <div className="spinner spinner-lg" />
                            <p className="auth-subtitle">Redirecting back…</p>
                        </div>
                    )}

                    {phase === 'error' && (
                        <>
                            <p className="auth-subtitle">Connection request failed</p>
                            <div className="auth-error">{error}</div>
                        </>
                    )}

                    {phase === 'confirm' && (
                        <>
                            <p className="auth-subtitle">
                                <strong>{clientName}</strong> wants to connect to SharkShell as <strong>{user?.email}</strong>
                            </p>

                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>Capability</label>
                                <div className="mcp-radio-row">
                                    <label className={`mcp-radio ${scope.capability === 'read_only' ? 'mcp-radio-active' : ''}`}>
                                        <input type="radio" name="cap" checked={scope.capability === 'read_only'} onChange={() => setScope({ ...scope, capability: 'read_only' })} />
                                        <div><strong>Read-only</strong><span>List hosts &amp; keys. Cannot run commands.</span></div>
                                    </label>
                                    <label className={`mcp-radio ${scope.capability === 'execute' ? 'mcp-radio-active' : ''}`}>
                                        <input type="radio" name="cap" checked={scope.capability === 'execute'} onChange={() => setScope({ ...scope, capability: 'execute' })} />
                                        <div><strong>Execute</strong><span>Run commands on allowed hosts.</span></div>
                                    </label>
                                </div>
                            </div>

                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Host scope</label>
                                <label className="mcp-checkline">
                                    <input type="checkbox" checked={scope.scopeAll} onChange={(e) => setScope({ ...scope, scopeAll: e.target.checked })} />
                                    <span>All hosts (current and future)</span>
                                </label>
                            </div>

                            {!scope.scopeAll && (
                                <div className="mcp-scope-picker" style={{ marginBottom: 16 }}>
                                    {groups.length > 0 && (
                                        <>
                                            <div className="mcp-scope-heading">Groups</div>
                                            {groups.map((g) => (
                                                <label key={g.id} className="mcp-checkline">
                                                    <input type="checkbox" checked={scope.allowedGroupIds.includes(g.id)} onChange={() => setScope({ ...scope, allowedGroupIds: toggleId(scope.allowedGroupIds, g.id) })} />
                                                    <span className="group-dot" style={{ background: g.color }} />{g.name}
                                                </label>
                                            ))}
                                        </>
                                    )}
                                    <div className="mcp-scope-heading">Hosts</div>
                                    {hosts.length === 0 && <p className="mcp-audit-empty">No hosts saved yet.</p>}
                                    {hosts.map((h) => (
                                        <label key={h.id} className="mcp-checkline">
                                            <input type="checkbox" checked={scope.allowedHostIds.includes(h.id)} onChange={() => setScope({ ...scope, allowedHostIds: toggleId(scope.allowedHostIds, h.id) })} />
                                            <span>{h.name} <span className="mcp-host-addr">{h.username}@{h.hostname}</span></span>
                                        </label>
                                    ))}
                                    {scope.allowedHostIds.length === 0 && scope.allowedGroupIds.length === 0 && (
                                        <p className="mcp-note" style={{ marginTop: 8 }}>⚠️ With no hosts or groups selected, this connection can reach no hosts.</p>
                                    )}
                                </div>
                            )}

                            <p className="mcp-note" style={{ marginBottom: 16 }}>
                                Grants a scoped access key, valid for 30 days and silently renewed while in use. Revoke anytime in <strong>Settings → MCP Access</strong>.
                            </p>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} disabled={submitting} onClick={() => decide(false)}>Deny</button>
                                <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={submitting} onClick={() => decide(true)}>
                                    {submitting ? <span className="spinner" /> : 'Allow'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
