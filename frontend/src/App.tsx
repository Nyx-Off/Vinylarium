import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import ProfilesPage from './pages/ProfilesPage';
import LibraryPage from './pages/LibraryPage';
import ReleaseDetailPage from './pages/ReleaseDetailPage';
import SearchPage from './pages/SearchPage';
import StoragePage from './pages/StoragePage';
import ImportPage from './pages/ImportPage';
import ManualAddPage from './pages/ManualAddPage';
import SettingsPage from './pages/SettingsPage';
import MapPage from './pages/MapPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<ProfilesPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/release/:id" element={<ReleaseDetailPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/add" element={<ManualAddPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
