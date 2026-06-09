import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import { Me, PublicUser } from '../api/types';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  login: (token: string, user: PublicUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ user: Me }>('/auth/me');
      setUser(data.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interceptor = api.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401) {
          setToken(null);
          setUser(null);
        }
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(interceptor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(token: string, u: PublicUser) {
    setToken(token);
    setUser({ ...u, preferences: {} });
    refresh();
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
