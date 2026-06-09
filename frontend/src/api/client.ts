import axios from 'axios';

const TOKEN_KEY = 'vinylarium_token';

export const api = axios.create({ baseURL: '/api' });

const stored = localStorage.getItem(TOKEN_KEY);
if (stored) api.defaults.headers.common['Authorization'] = `Bearer ${stored}`;

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Pull a human message out of an axios error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: string } | undefined)?.error || err.message || fallback;
  }
  return fallback;
}
