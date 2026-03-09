import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { TerminalProvider } from './context/TerminalContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import HostsPage from './pages/HostsPage';
import KeystorePage from './pages/KeystorePage';
import TerminalPage from './pages/TerminalPage';

function PrivateRoute({ children }) {
    const { user, loading, loadingSetup } = useAuth();
    if (loading || loadingSetup) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
                <div className="spinner spinner-lg"></div>
            </div>
        );
    }
    return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
    const { user, loading, loadingSetup } = useAuth();
    if (loading || loadingSetup) return null;
    return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><TerminalProvider><DashboardLayout /></TerminalProvider></PrivateRoute>}>
                <Route index element={<DashboardPage />} />
                <Route path="hosts" element={<HostsPage />} />
                <Route path="keys" element={<KeystorePage />} />
                <Route path="terminal" element={<TerminalPage />} />
            </Route>
        </Routes>
    );
}
