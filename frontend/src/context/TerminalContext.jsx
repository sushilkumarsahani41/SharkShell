import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiUrl, API_URL } from '../api';

const TerminalContext = createContext(null);

const STORAGE_KEY = 'sharkshell_workspaces';
let wsCounter = 0;
let sessionCounter = 0;

function loadSavedWorkspaces() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            // Restore counters
            data.forEach(ws => {
                const wsNum = parseInt(ws.id.replace('ws-', ''));
                if (!isNaN(wsNum) && wsNum > wsCounter) wsCounter = wsNum;
                ws.sessions.forEach(s => {
                    const sNum = parseInt(s.id.replace('sess-', ''));
                    if (!isNaN(sNum) && sNum > sessionCounter) sessionCounter = sNum;
                    // Mark saved sessions as 'saved' (not yet connected)
                    s.status = 'saved';
                });
            });
            // Ensure default workspace exists
            if (!data.find(w => w.id === 'ws-default')) {
                data.unshift({ id: 'ws-default', name: 'Default', sessions: [] });
            }
            return data;
        }
    } catch { }
    return [{ id: 'ws-default', name: 'Default', sessions: [] }];
}

function saveWorkspacesToStorage(workspaces) {
    try {
        // Save only serializable data (no socket/term refs)
        const toSave = workspaces.map(ws => ({
            id: ws.id,
            name: ws.name,
            sessions: ws.sessions.map(s => ({
                id: s.id,
                hostId: s.hostId,
                hostName: s.hostName,
                hostAddr: s.hostAddr,
                status: 'saved', // Always save as 'saved'
            })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch { }
}

export function TerminalProvider({ children }) {
    const { token } = useAuth();
    const navigate = useNavigate();

    const [workspaces, setWorkspaces] = useState(() => loadSavedWorkspaces());
    const [activeWorkspaceId, setActiveWorkspaceId] = useState('ws-default');
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [passphrasePrompt, setPassphrasePrompt] = useState(null); // { sessionId, hostId }

    // Refs to hold live socket/term objects (not in React state to avoid re-renders)
    const sessionRefs = useRef({}); // { [sessionId]: { socket, term, fitAddon, resizeObserver } }

    // ─── Auto-save workspaces on change ───
    useEffect(() => {
        saveWorkspacesToStorage(workspaces);
    }, [workspaces]);

    // ─── Workspace CRUD ───

    function createWorkspace(name) {
        const id = `ws-${++wsCounter}`;
        setWorkspaces(prev => [...prev, { id, name: name || `Workspace ${wsCounter}`, sessions: [] }]);
        setActiveWorkspaceId(id);
        navigate('/dashboard/terminal');
        return id;
    }

    function renameWorkspace(id, name) {
        setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w));
    }

    function deleteWorkspace(id) {
        if (id === 'ws-default') return;
        const ws = workspaces.find(w => w.id === id);
        if (ws) {
            ws.sessions.forEach(s => destroySessionRefs(s.id));
        }
        setWorkspaces(prev => {
            const remaining = prev.filter(w => w.id !== id);
            if (activeWorkspaceId === id) {
                setActiveWorkspaceId('ws-default');
                setActiveSessionId(null);
            }
            return remaining;
        });
    }

    // ─── Session Management ───

    function createSession(workspaceId, host) {
        const wId = workspaceId || activeWorkspaceId;
        const id = `sess-${++sessionCounter}`;
        const session = {
            id,
            hostId: host.id,
            hostName: host.name,
            hostAddr: `${host.username}@${host.hostname}`,
            status: 'connecting',
        };
        setWorkspaces(prev => prev.map(w =>
            w.id === wId ? { ...w, sessions: [...w.sessions, session] } : w
        ));
        setActiveWorkspaceId(wId);
        setActiveSessionId(id);
        navigate('/dashboard/terminal');
        setTimeout(() => connectSession(id, host, wId), 80);
        return id;
    }

    // Reconnect a saved session
    function reconnectSession(sessionId) {
        let session = null;
        for (const ws of workspaces) {
            const found = ws.sessions.find(s => s.id === sessionId);
            if (found) { session = found; break; }
        }
        if (!session) return;

        updateSessionStatus(sessionId, 'connecting');
        setActiveSessionId(sessionId);
        navigate('/dashboard/terminal');

        // Use a minimal host object for connection
        const host = { id: session.hostId, name: session.hostName, hostname: session.hostAddr.split('@')[1], username: session.hostAddr.split('@')[0] };
        setTimeout(() => connectSession(sessionId, host), 80);
    }

    // Reconnect all saved/disconnected sessions in a workspace
    function reconnectWorkspace(workspaceId) {
        const ws = workspaces.find(w => w.id === workspaceId);
        if (!ws) return;
        const toReconnect = ws.sessions.filter(s => s.status === 'saved' || s.status === 'disconnected');
        toReconnect.forEach((s, i) => {
            setTimeout(() => reconnectSession(s.id), i * 150);
        });
    }

    async function connectSession(sessionId, host) {
        const { Terminal } = await import('@xterm/xterm');
        const { FitAddon } = await import('@xterm/addon-fit');
        const { WebLinksAddon } = await import('@xterm/addon-web-links');

        // If there's already a term, dispose it first
        if (sessionRefs.current[sessionId]?.term) {
            sessionRefs.current[sessionId].term.dispose();
        }

        const term = new Terminal({
            theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', cursorAccent: '#0d1117', selectionBackground: 'rgba(99, 102, 241, 0.3)' },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 14, cursorBlink: true, cursorStyle: 'bar', scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        const container = document.getElementById(`term-${sessionId}`);
        if (container) {
            container.innerHTML = '';
            term.open(container);
            try { fitAddon.fit(); } catch { }
        }

        term.writeln(`\x1b[33m⏳ Connecting to ${host.name}...\x1b[0m`);

        const resizeObserver = new ResizeObserver(() => { try { fitAddon.fit(); } catch { } });
        if (container) resizeObserver.observe(container);

        sessionRefs.current[sessionId] = { socket: null, term, fitAddon, resizeObserver };

        try {
            const { io } = await import('socket.io-client');
            const socketUrl = API_URL || window.location.origin;
            const socket = io(socketUrl, { path: '/api/socket', auth: { token }, transports: ['websocket', 'polling'] });

            sessionRefs.current[sessionId].socket = socket;

            term.onData((data) => { if (socket.connected) socket.emit('ssh:input', data); });
            term.onResize(({ cols, rows }) => { if (socket.connected) socket.emit('ssh:resize', { cols, rows }); });

            socket.on('connect', () => {
                socket.emit('ssh:connect', { hostId: host.id, cols: term.cols, rows: term.rows });
            });

            socket.on('ssh:connected', () => {
                updateSessionStatus(sessionId, 'connected');
                term.clear();
                term.focus();
            });

            socket.on('ssh:data', (data) => { term.write(data); });

            socket.on('ssh:passphrase-needed', (data) => {
                term.writeln(`\r\n\x1b[33m🔑 Passphrase required for this key\x1b[0m\r\n`);
                setPassphrasePrompt({ sessionId, hostId: data.hostId });
            });

            socket.on('ssh:error', (data) => {
                term.writeln(`\r\n\x1b[31m❌ Error: ${data.message}\x1b[0m\r\n`);
                updateSessionStatus(sessionId, 'disconnected');
            });

            socket.on('ssh:closed', (data) => {
                term.writeln(`\r\n\x1b[33m⚡ ${data.message || 'Connection closed'}\x1b[0m\r\n`);
                updateSessionStatus(sessionId, 'disconnected');
            });

            socket.on('connect_error', (err) => {
                term.writeln(`\r\n\x1b[31m❌ Socket error: ${err.message}\x1b[0m\r\n`);
                updateSessionStatus(sessionId, 'disconnected');
            });
        } catch (err) {
            term.writeln(`\r\n\x1b[31m❌ Failed: ${err.message}\x1b[0m\r\n`);
            updateSessionStatus(sessionId, 'disconnected');
        }
    }

    function updateSessionStatus(sessionId, status) {
        setWorkspaces(prev => prev.map(w => ({
            ...w,
            sessions: w.sessions.map(s => s.id === sessionId ? { ...s, status } : s),
        })));
    }

    function closeSession(sessionId) {
        destroySessionRefs(sessionId);
        setWorkspaces(prev => prev.map(w => ({
            ...w,
            sessions: w.sessions.filter(s => s.id !== sessionId),
        })));
        if (activeSessionId === sessionId) {
            const ws = workspaces.find(w => w.id === activeWorkspaceId);
            const remaining = ws?.sessions.filter(s => s.id !== sessionId) || [];
            setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
        }
    }

    function destroySessionRefs(sessionId) {
        const refs = sessionRefs.current[sessionId];
        if (refs) {
            if (refs.socket) { refs.socket.emit('ssh:disconnect'); refs.socket.disconnect(); }
            if (refs.resizeObserver) refs.resizeObserver.disconnect();
            if (refs.term) refs.term.dispose();
            delete sessionRefs.current[sessionId];
        }
    }

    function switchSession(workspaceId, sessionId) {
        setActiveWorkspaceId(workspaceId);
        setActiveSessionId(sessionId);
        navigate('/dashboard/terminal');
        setTimeout(() => {
            const refs = sessionRefs.current[sessionId];
            if (refs?.fitAddon) try { refs.fitAddon.fit(); } catch { }
            if (refs?.term) refs.term.focus();
        }, 50);
    }

    function submitPassphrase(passphrase) {
        if (!passphrasePrompt) return;
        const { sessionId, hostId } = passphrasePrompt;
        const refs = sessionRefs.current[sessionId];
        if (refs?.socket?.connected) {
            refs.term?.writeln(`\x1b[33m⏳ Retrying with passphrase...\x1b[0m`);
            refs.socket.emit('ssh:connect', { hostId, passphrase, cols: refs.term?.cols || 80, rows: refs.term?.rows || 24 });
        }
        setPassphrasePrompt(null);
    }

    function cancelPassphrase() {
        if (passphrasePrompt) {
            const refs = sessionRefs.current[passphrasePrompt.sessionId];
            refs?.term?.writeln(`\r\n\x1b[31m❌ Passphrase not provided — connection cancelled\x1b[0m\r\n`);
            updateSessionStatus(passphrasePrompt.sessionId, 'disconnected');
        }
        setPassphrasePrompt(null);
    }

    function connectGroup(workspaceId, hostsInGroup) {
        const wId = workspaceId || activeWorkspaceId;
        hostsInGroup.forEach((host, i) => {
            setTimeout(() => createSession(wId, host), i * 150);
        });
    }

    function getSessionRefs(sessionId) {
        return sessionRefs.current[sessionId] || null;
    }

    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

    return (
        <TerminalContext.Provider value={{
            workspaces,
            activeWorkspaceId,
            activeSessionId,
            activeWorkspace,
            setActiveWorkspaceId,
            setActiveSessionId,
            createWorkspace,
            renameWorkspace,
            deleteWorkspace,
            createSession,
            closeSession,
            switchSession,
            connectGroup,
            getSessionRefs,
            reconnectSession,
            reconnectWorkspace,
            passphrasePrompt,
            submitPassphrase,
            cancelPassphrase,
        }}>
            {children}
        </TerminalContext.Provider>
    );
}

export function useTerminal() {
    const ctx = useContext(TerminalContext);
    if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
    return ctx;
}
