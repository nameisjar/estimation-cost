export type AdminSession = { username: string };
export type AdminStats = { total: number; active: number; inactive: number; missingAddress: number };
export type AdminPlace = {
  id: string;
  externalPlaceId: string | null;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  googleMapsUrl: string | null;
  searchKeyword: string | null;
  searchArea: string | null;
  active: boolean;
  verified: boolean;
  minZoom: number;
  labelPriority: number;
  createdAt: string;
  updatedAt: string;
};
export type AdminPlaceInput = Omit<AdminPlace, 'id' | 'externalPlaceId' | 'verified' | 'minZoom' | 'labelPriority' | 'createdAt' | 'updatedAt'>;
export type AdminPlaceList = { items: AdminPlace[]; total: number; page: number; limit: number };

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class AdminApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method && options.method !== 'GET' ? { 'X-AntarFix-Admin': '1' } : {}),
      ...options.headers,
    },
  });
  let body: { success?: boolean; data?: T; error?: { code?: string; message?: string } } = {};
  try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok || !body.success) {
    throw new AdminApiError(body.error?.message || 'Permintaan admin belum berhasil.', response.status, body.error?.code || 'ADMIN_REQUEST_FAILED');
  }
  return body.data as T;
}

export function adminLogin(username: string, password: string) {
  return request<AdminSession>('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export function adminLogout() { return request<null>('/api/admin/logout', { method: 'POST' }); }
export function getAdminSession() { return request<AdminSession>('/api/admin/session'); }
export function getAdminStats() { return request<AdminStats>('/api/admin/stats'); }
export function getAdminPlaces(query = '', status = 'all', page = 1, limit = 20) {
  const params = new URLSearchParams({ q: query, status, page: String(page), limit: String(limit) });
  return request<AdminPlaceList>(`/api/admin/places?${params}`);
}
export function createAdminPlace(place: AdminPlaceInput) {
  return request<AdminPlace>('/api/admin/places', { method: 'POST', body: JSON.stringify(place) });
}
export function updateAdminPlace(id: string, place: AdminPlaceInput) {
  return request<AdminPlace>(`/api/admin/places/${id}`, { method: 'PUT', body: JSON.stringify(place) });
}
export function setAdminPlaceActive(id: string, active: boolean) {
  return request<AdminPlace>(`/api/admin/places/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
}
