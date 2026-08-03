import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSftp } from '../context/SftpContext';
import { apiUrl } from '../api';

const DRAG_MIME = 'application/x-sharkshell-file';

function formatBytes(n) {
    if (n === null || n === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, v = Number(n);
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString();
}

function FileIcon({ type }) {
    if (type === 'directory') {
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    }
    if (type === 'symlink') {
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
    }
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
}

function HostPicker({ pane, onConnect }) {
    const { token } = useAuth();
    const [hosts, setHosts] = useState([]);
    const [selected, setSelected] = useState('');
    const [password, setPassword] = useState('');
    const [passphrase, setPassphrase] = useState('');

    useEffect(() => {
        fetch(apiUrl('/api/hosts'), { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => setHosts(data.hosts || []))
            .catch(() => { });
    }, [token]);

    const host = hosts.find(h => h.id === selected);

    return (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            <h3>Browse a host</h3>
            <p>Pick a saved host to open its files over SFTP.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '16px auto 0' }}>
                <select className="input-field" value={selected} onChange={e => setSelected(e.target.value)}>
                    <option value="">Select a host…</option>
                    {hosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.username}@{h.hostname})</option>)}
                </select>
                {pane.passphraseNeeded && (
                    <input type="password" className="input-field" placeholder="Key passphrase" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
                )}
                {host?.auth_type === 'password' && (
                    <input type="password" className="input-field" placeholder="Password (if not saved)" value={password} onChange={e => setPassword(e.target.value)} />
                )}
                <button className="btn btn-primary" disabled={!selected || pane.connecting} onClick={() => onConnect(host, { password, passphrase })}>
                    {pane.connecting ? <span className="spinner" /> : 'Connect'}
                </button>
                {pane.error && <div className="auth-error">{pane.error}</div>}
            </div>
        </div>
    );
}

function Pane({ pane, showRemove, dualPane }) {
    const { connectHost, navigateInto, navigateUp, navigateTo, mkdir, rename, deleteEntry, downloadEntry, uploadFiles, transferEntry, closePane, disconnectPane } = useSftp();
    const [dragKind, setDragKind] = useState(null); // null | 'upload' | 'transfer'
    const dragCounter = useRef(0);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [renaming, setRenaming] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [showMkdir, setShowMkdir] = useState(false);
    const [mkdirName, setMkdirName] = useState('');
    const [msg, setMsg] = useState(null);

    function flash(text, type = 'error') { setMsg({ text, type }); setTimeout(() => setMsg(null), 3000); }

    const crumbs = pane.path === '.' || pane.path === '' ? [] : pane.path.replace(/^\//, '').split('/').filter(Boolean);

    function dragKindFor(e) {
        return e.dataTransfer.types.includes(DRAG_MIME) ? 'transfer' : 'upload';
    }

    function handleDragEnter(e) {
        e.preventDefault();
        dragCounter.current++;
        setDragKind(dragKindFor(e));
    }

    function handleDragLeave(e) {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current <= 0) { dragCounter.current = 0; setDragKind(null); }
    }

    async function handleDrop(e) {
        e.preventDefault();
        dragCounter.current = 0;
        setDragKind(null);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (raw) {
            // Pane-to-pane transfer
            const { paneId: fromPaneId, entry } = JSON.parse(raw);
            if (fromPaneId === pane.id) return;
            const result = await transferEntry(fromPaneId, entry, pane.id);
            if (!result.ok) flash(result.error || 'Transfer failed');
            return;
        }
        if (e.dataTransfer.files?.length) {
            await uploadFiles(pane.id, Array.from(e.dataTransfer.files));
        }
    }

    return (
        <div className="sftp-pane glass-card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="mcp-audit-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pane.hostName || 'Not connected'}
                    {pane.sessionId && <span className="badge badge-success">Connected</span>}
                </h3>
                <div style={{ display: 'flex', gap: 6 }}>
                    {pane.sessionId && <button className="btn btn-ghost btn-sm" onClick={() => setShowMkdir(true)} title="Create a new folder here">+ Folder</button>}
                    {pane.sessionId && (
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }} title="Choose files from your computer to upload">
                            Upload
                            <input type="file" multiple style={{ display: 'none' }} onChange={e => uploadFiles(pane.id, Array.from(e.target.files))} />
                        </label>
                    )}
                    {pane.sessionId && <button className="btn btn-ghost btn-sm" onClick={() => disconnectPane(pane.id)} title="Close this SFTP connection">Disconnect</button>}
                    {showRemove && <button className="btn btn-ghost btn-sm" onClick={() => closePane(pane.id)} title="Remove this pane">✕</button>}
                </div>
            </div>

            {msg && <div className="auth-error" style={{ marginBottom: 10 }}>{msg.text}</div>}

            {!pane.sessionId ? (
                <HostPicker pane={pane} onConnect={(host, opts) => connectHost(pane.id, host, opts)} />
            ) : (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigateUp(pane.id)} title="Up one level">⬆</button>
                            <span style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => navigateTo(pane.id, '.')}>/</span>
                            {crumbs.map((c, i) => (
                                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>/</span>
                                    <span style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => navigateTo(pane.id, crumbs.slice(0, i + 1).join('/'))}>{c}</span>
                                </span>
                            ))}
                        </div>
                        <span className="mcp-note" style={{ whiteSpace: 'nowrap' }}>
                            💡 Drag files here to upload{dualPane ? ', or between panes to transfer' : ''}
                        </span>
                    </div>

                    <div
                        className="mcp-audit-scroll"
                        style={{ flex: 1, minHeight: 240, position: 'relative', borderRadius: 8 }}
                        onDragEnter={handleDragEnter}
                        onDragOver={(e) => e.preventDefault()}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {dragKind && (
                            <div style={{
                                position: 'absolute', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 8,
                                background: 'rgba(99, 102, 241, 0.12)', border: '2px dashed var(--accent-primary)',
                                borderRadius: 8, pointerEvents: 'none',
                            }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <strong style={{ color: 'var(--accent-primary)' }}>{dragKind === 'transfer' ? `Drop to transfer to ${pane.hostName}` : 'Drop to upload'}</strong>
                            </div>
                        )}
                        {pane.loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner spinner-lg" /></div>
                        ) : pane.error ? (
                            <div className="auth-error">{pane.error}</div>
                        ) : pane.entries.length === 0 ? (
                            <p className="mcp-audit-empty">Empty directory.</p>
                        ) : (
                            <table className="mcp-audit-table">
                                <thead><tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead>
                                <tbody>
                                    {pane.entries.map(entry => (
                                        <tr
                                            key={entry.name}
                                            draggable={entry.type === 'file'}
                                            onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ paneId: pane.id, entry }))}
                                            style={{ cursor: entry.type === 'directory' ? 'pointer' : entry.type === 'file' ? 'grab' : 'default' }}
                                            onDoubleClick={() => navigateInto(pane.id, entry)}
                                        >
                                            <td style={{ color: entry.type === 'directory' ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}><FileIcon type={entry.type} /></td>
                                            <td onClick={() => entry.type === 'directory' && navigateInto(pane.id, entry)}>
                                                {renaming === entry.name ? (
                                                    <input
                                                        className="input-field" style={{ padding: '2px 6px', fontSize: 13 }} autoFocus value={renameValue}
                                                        onChange={e => setRenameValue(e.target.value)}
                                                        onKeyDown={async (e) => {
                                                            if (e.key === 'Enter') {
                                                                const r = await rename(pane.id, entry, renameValue);
                                                                if (!r.ok) flash(r.error || 'Rename failed');
                                                                setRenaming(null);
                                                            } else if (e.key === 'Escape') setRenaming(null);
                                                        }}
                                                        onBlur={() => setRenaming(null)}
                                                    />
                                                ) : entry.name}
                                            </td>
                                            <td>{entry.type === 'file' ? formatBytes(entry.size) : '—'}</td>
                                            <td>{formatDate(entry.mtime)}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {entry.type === 'file' && <button className="btn btn-ghost btn-sm" title="Download" onClick={() => downloadEntry(pane.id, entry)}>↓</button>}
                                                    <button className="btn btn-ghost btn-sm" title="Rename" onClick={() => { setRenaming(entry.name); setRenameValue(entry.name); }}>✎</button>
                                                    <button className="btn btn-ghost btn-sm btn-danger-text" title="Delete" onClick={() => setConfirmDelete(entry)}>✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {showMkdir && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowMkdir(false)}>
                    <div className="modal" style={{ maxWidth: 360 }}>
                        <h2>New folder</h2>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const r = await mkdir(pane.id, mkdirName);
                            if (!r.ok) flash(r.error || 'Failed to create folder');
                            setShowMkdir(false); setMkdirName('');
                        }}>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <input className="input-field" autoFocus value={mkdirName} onChange={e => setMkdirName(e.target.value)} placeholder="Folder name" required />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowMkdir(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
                    <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h2 style={{ marginBottom: 8 }}>Delete “{confirmDelete.name}”?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={async () => {
                                const r = await deleteEntry(pane.id, confirmDelete);
                                if (!r.ok) flash(r.error || 'Delete failed');
                                setConfirmDelete(null);
                            }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SftpPage() {
    const { panes, addPane } = useSftp();

    return (
        <div>
            <div className="page-header">
                <div><h1>SFTP</h1><p>Browse, transfer, and manage files on your hosts</p></div>
                {panes.length < 2 && <button className="btn btn-secondary" onClick={addPane} title="Browse a second host side-by-side to drag files between them">+ Add second pane</button>}
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
                {panes.map(pane => (
                    <Pane key={pane.id} pane={pane} showRemove={panes.length > 1} dualPane={panes.length > 1} />
                ))}
            </div>
        </div>
    );
}
