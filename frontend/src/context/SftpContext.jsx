import { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiUrl } from '../api';

const SftpContext = createContext(null);

function emptyPane(id) {
    return {
        id,
        hostId: null,
        hostName: null,
        sessionId: null,
        path: '.',
        entries: [],
        loading: false,
        error: null,
        connecting: false,
        passphraseNeeded: false,
    };
}

export function SftpProvider({ children }) {
    const { token } = useAuth();
    const [panes, setPanes] = useState([emptyPane('a')]);

    const headers = useCallback((json) => (json
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { Authorization: `Bearer ${token}` }), [token]);

    function updatePane(paneId, patch) {
        setPanes(prev => prev.map(p => (p.id === paneId ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)));
    }

    function addPane() {
        setPanes(prev => (prev.length >= 2 ? prev : [...prev, emptyPane('b')]));
    }

    // Closes the SFTP session but keeps this pane slot — returns to the host picker
    // so the user can pick a different host without leaving dual-pane mode.
    async function disconnectPane(paneId) {
        const pane = panes.find(p => p.id === paneId);
        if (pane?.sessionId) {
            fetch(apiUrl(`/api/sftp/sessions/${pane.sessionId}`), { method: 'DELETE', headers: headers() }).catch(() => { });
        }
        updatePane(paneId, emptyPane(paneId));
    }

    // Removes the pane slot entirely (dual-pane -> single-pane).
    async function closePane(paneId) {
        const pane = panes.find(p => p.id === paneId);
        if (pane?.sessionId) {
            fetch(apiUrl(`/api/sftp/sessions/${pane.sessionId}`), { method: 'DELETE', headers: headers() }).catch(() => { });
        }
        setPanes(prev => {
            const remaining = prev.filter(p => p.id !== paneId);
            return remaining.length ? remaining : [emptyPane(paneId)];
        });
    }

    async function connectHost(paneId, host, opts = {}) {
        updatePane(paneId, { connecting: true, error: null, passphraseNeeded: false, hostId: host.id, hostName: host.name });
        try {
            const res = await fetch(apiUrl('/api/sftp/sessions'), {
                method: 'POST', headers: headers(true),
                body: JSON.stringify({ hostId: host.id, password: opts.password, passphrase: opts.passphrase }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === 'passphrase-needed') {
                    updatePane(paneId, { connecting: false, passphraseNeeded: true });
                    return;
                }
                throw new Error(data.error || 'Failed to connect');
            }
            updatePane(paneId, { connecting: false, sessionId: data.session.id, hostName: data.session.hostName, path: '.' });
            await list(paneId, data.session.id, '.');
        } catch (err) {
            updatePane(paneId, { connecting: false, error: err.message });
        }
    }

    async function list(paneId, sessionIdOverride, pathOverride) {
        const pane = panes.find(p => p.id === paneId);
        const sessionId = sessionIdOverride || pane?.sessionId;
        const path = pathOverride !== undefined ? pathOverride : pane?.path;
        if (!sessionId) return;
        updatePane(paneId, { loading: true, error: null });
        try {
            const res = await fetch(apiUrl(`/api/sftp/sessions/${sessionId}/list?path=${encodeURIComponent(path)}`), { headers: headers() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to list directory');
            updatePane(paneId, { entries: data.entries, path, loading: false });
        } catch (err) {
            updatePane(paneId, { loading: false, error: err.message });
        }
    }

    function navigateInto(paneId, entry) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane || entry.type !== 'directory') return;
        const next = joinPath(pane.path, entry.name);
        list(paneId, pane.sessionId, next);
    }

    function navigateUp(paneId) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane) return;
        const parent = parentPath(pane.path);
        list(paneId, pane.sessionId, parent);
    }

    function navigateTo(paneId, path) {
        list(paneId, undefined, path);
    }

    async function mkdir(paneId, name) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane?.sessionId) return { ok: false, error: 'Not connected' };
        const target = joinPath(pane.path, name);
        const res = await fetch(apiUrl(`/api/sftp/sessions/${pane.sessionId}/mkdir`), { method: 'POST', headers: headers(true), body: JSON.stringify({ path: target }) });
        const data = await res.json();
        if (res.ok) await list(paneId);
        return { ok: res.ok, error: data.error };
    }

    async function rename(paneId, entry, newName) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane?.sessionId) return { ok: false, error: 'Not connected' };
        const from = joinPath(pane.path, entry.name);
        const to = joinPath(pane.path, newName);
        const res = await fetch(apiUrl(`/api/sftp/sessions/${pane.sessionId}/rename`), { method: 'POST', headers: headers(true), body: JSON.stringify({ from, to }) });
        const data = await res.json();
        if (res.ok) await list(paneId);
        return { ok: res.ok, error: data.error };
    }

    async function deleteEntry(paneId, entry) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane?.sessionId) return { ok: false, error: 'Not connected' };
        const target = joinPath(pane.path, entry.name);
        const res = await fetch(
            apiUrl(`/api/sftp/sessions/${pane.sessionId}/entry?path=${encodeURIComponent(target)}&type=${entry.type === 'directory' ? 'directory' : 'file'}`),
            { method: 'DELETE', headers: headers() },
        );
        const data = await res.json();
        if (res.ok) await list(paneId);
        return { ok: res.ok, error: data.error };
    }

    function downloadEntry(paneId, entry) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane?.sessionId) return;
        const target = joinPath(pane.path, entry.name);
        const url = apiUrl(`/api/sftp/sessions/${pane.sessionId}/download?path=${encodeURIComponent(target)}`);
        fetch(url, { headers: headers() })
            .then(res => res.blob())
            .then(blob => {
                const objUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objUrl; a.download = entry.name; a.click();
                URL.revokeObjectURL(objUrl);
            });
    }

    async function uploadFiles(paneId, files) {
        const pane = panes.find(p => p.id === paneId);
        if (!pane?.sessionId || !files?.length) return;
        for (const file of files) {
            const target = joinPath(pane.path, file.name);
            const formData = new FormData();
            formData.append('file', file);
            try {
                await fetch(apiUrl(`/api/sftp/sessions/${pane.sessionId}/upload?path=${encodeURIComponent(target)}`), {
                    method: 'POST', headers: headers(), body: formData,
                });
            } catch { /* surfaced via refresh not showing the file */ }
        }
        await list(paneId);
    }

    // Direct host-to-host transfer for dual-pane mode — streams server-side.
    async function transferEntry(sourcePaneId, entry, destPaneId) {
        const source = panes.find(p => p.id === sourcePaneId);
        const dest = panes.find(p => p.id === destPaneId);
        if (!source?.sessionId || !dest?.sessionId || entry.type === 'directory') return { ok: false, error: 'Only files can be transferred, and both panes must be connected' };
        const sourcePath = joinPath(source.path, entry.name);
        const destPath = joinPath(dest.path, entry.name);
        const res = await fetch(apiUrl('/api/sftp/transfer'), {
            method: 'POST', headers: headers(true),
            body: JSON.stringify({ sourceSessionId: source.sessionId, sourcePath, destSessionId: dest.sessionId, destPath }),
        });
        const data = await res.json();
        if (res.ok) await list(destPaneId);
        return { ok: res.ok, error: data.error };
    }

    return (
        <SftpContext.Provider value={{
            panes, addPane, closePane, disconnectPane, connectHost, list, navigateInto, navigateUp, navigateTo,
            mkdir, rename, deleteEntry, downloadEntry, uploadFiles, transferEntry,
        }}>
            {children}
        </SftpContext.Provider>
    );
}

function joinPath(base, name) {
    if (base === '.' || base === '') return name;
    return `${base.replace(/\/$/, '')}/${name}`;
}

function parentPath(p) {
    if (p === '.' || p === '' || p === '/') return '.';
    const parts = p.replace(/\/$/, '').split('/').filter(Boolean);
    parts.pop();
    return parts.length ? (p.startsWith('/') ? '/' + parts.join('/') : parts.join('/')) : (p.startsWith('/') ? '/' : '.');
}

export function useSftp() {
    const ctx = useContext(SftpContext);
    if (!ctx) throw new Error('useSftp must be used within SftpProvider');
    return ctx;
}
