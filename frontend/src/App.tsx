import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { resolveFeatures } from './lib/features';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import ProfilesPage from './pages/ProfilesPage';
import LibraryPage from './pages/LibraryPage';
import ReleaseDetailPage from './pages/ReleaseDetailPage';
import ArtistPage from './pages/ArtistPage';
import SearchPage from './pages/SearchPage';
import StoragePage from './pages/StoragePage';
import ImportPage from './pages/ImportPage';
import ManualAddPage from './pages/ManualAddPage';
import SettingsPage from './pages/SettingsPage';
import MapPage from './pages/MapPage';
import TimelinePage from './pages/TimelinePage';
import StatsPage from './pages/StatsPage';
import ShowcasePage from './pages/ShowcasePage';
import SpotifyCallbackPage from './pages/SpotifyCallbackPage';

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

  // A disabled feature's route falls back to the library, so a bookmarked or
  // hand-typed URL can't reach a page the profile has switched off.
  const features = resolveFeatures(user.preferences);

  return (
    <Routes>
      {/* Fullscreen, outside the app chrome. */}
      <Route path="/showcase/:id" element={<ShowcasePage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/release/:id" element={<ReleaseDetailPage />} />
        <Route path="/artist/:id" element={<ArtistPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route
          path="/storage"
          element={features.storage ? <StoragePage /> : <Navigate to="/library" replace />}
        />
        <Route
          path="/map"
          element={features.map ? <MapPage /> : <Navigate to="/library" replace />}
        />
        <Route
          path="/timeline"
          element={features.timeline ? <TimelinePage /> : <Navigate to="/library" replace />}
        />
        <Route
          path="/stats"
          element={features.stats ? <StatsPage /> : <Navigate to="/library" replace />}
        />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/add" element={<ManualAddPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/spotify/callback" element={<SpotifyCallbackPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
