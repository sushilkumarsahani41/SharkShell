import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { TerminalProvider } from './context/TerminalContext';
import { FilesProvider } from './context/FilesContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForcePasswordPage from './pages/ForcePasswordPage';
import DashboardPage from './pages/DashboardPage';
import HostsPage from './pages/HostsPage';
import KeystorePage from './pages/KeystorePage';
import SettingsPage from './pages/SettingsPage';
import McpPage from './pages/McpPage';
import FilesPage from './pages/FilesPage';
import OAuthConsentPage from './pages/OAuthConsentPage';

function PrivateRoute({ children }) {
    const { user, loading, loadingSetup } = useAuth();
    if (loading || loadingSetup) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
                <div className="spinner spinner-lg"></div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    // Admin-created accounts must replace their temporary password first
    if (user.must_change_password) return <ForcePasswordPage />;
    return children;
}

function PublicRoute({ children }) {
    const { user, loading, loadingSetup } = useAuth();
    if (loading || loadingSetup) return null;
    return user ? <Navigate to="/dashboard" replace /> : children;
}

// Unlike PrivateRoute/PublicRoute: a signed-in user stays on this page (no bounce to /dashboard),
// and a signed-out user is sent to /login with a `next` back to this exact URL, including its query string.
function OAuthRoute({ children }) {
    const { user, loading, loadingSetup } = useAuth();
    const location = useLocation();
    if (loading || loadingSetup) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
                <div className="spinner spinner-lg"></div>
            </div>
        );
    }
    if (!user) {
        const next = encodeURIComponent(`${location.pathname}${location.search}`);
        return <Navigate to={`/login?next=${next}`} replace />;
    }
    return children;
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
            <Route path="/oauth/authorize" element={<OAuthRoute><OAuthConsentPage /></OAuthRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><TerminalProvider><DashboardLayout /></TerminalProvider></PrivateRoute>}>
                <Route index element={<DashboardPage />} />
                <Route path="hosts" element={<HostsPage />} />
                <Route path="keys" element={<KeystorePage />} />
                <Route path="terminal" element={null} />
                <Route path="mcp" element={<McpPage />} />
                <Route path="files" element={<FilesProvider><FilesPage /></FilesProvider>} />
                <Route path="settings" element={<SettingsPage />} />
            </Route>
        </Routes>
    );
}
