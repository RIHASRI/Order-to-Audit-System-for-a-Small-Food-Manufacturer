import axios from 'axios';

/**
 * Normalizes the API base URL to ensure:
 * 1. Defaults to '/api' when not specified (local dev / reverse proxy)
 * 2. Trailing slashes are stripped
 * 3. Never produces missing or duplicate '/api' paths regardless of how
 *    VITE_API_URL is configured (e.g. with or without '/api', with trailing slash).
 */
export function normalizeApiBaseUrl(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return '/api';
  }
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  if (withoutTrailing.endsWith('/api')) {
    return withoutTrailing;
  }
  return `${withoutTrailing}/api`;
}

export const API_BASE = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  // Prevent duplicate '/api' if caller passed a path starting with '/api/'
  if (config.url && config.url.startsWith('/api/')) {
    config.url = config.url.slice(4);
  }
  const token = localStorage.getItem('ff_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('ff_token');
      localStorage.removeItem('ff_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ERR_NETWORK' || !err.response) {
      return 'Unable to reach backend server. If using Render free tier, the server may take up to 45 seconds to wake up from cold sleep.';
    }
    return (
      err.response?.data?.error?.message ||
      err.response?.data?.message ||
      err.message
    );
  }
  if (err instanceof Error) return err.message;
  return 'Unexpected error occurred';
}

export async function downloadBlob(url: string, filename: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
