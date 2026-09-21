export type AdminSession = { username: string };
export type AdminStats = { total: number; active: number; inactive: number; missingAddress: number };
export type AdminPlace = {
  id: string;
  externalPlaceId: string | null;
  name: string;
  category: string;
  iconType: string;
  iconTypeVerified: boolean;
  address: string;
  displayAddress: string;
  addressSource: 'missing' | 'survey' | 'automatic' | 'manual';
  addressVerified: boolean;
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
export type AdminPlaceInput = Omit<AdminPlace, 'id' | 'externalPlaceId' | 'displayAddress' | 'addressSource' | 'addressVerified' | 'iconTypeVerified' | 'verified' | 'minZoom' | 'labelPriority' | 'createdAt' | 'updatedAt'>;
export type AdminPlaceList = { items: AdminPlace[]; total: number; page: number; limit: number };
export type PlaceCsvImportMode = 'upsert' | 'insert-only';
export type PlaceCsvIssue = { row: number; name: string; message: string };
export type PlaceCsvWarning = PlaceCsvIssue;
export type PlaceCsvAdjustment = PlaceCsvIssue;
export type PlaceCsvPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newRows: number;
  updateRows: number;
  skippedRows: number;
  issues: PlaceCsvIssue[];
  correctedRows: number;
  corrections: PlaceCsvAdjustment[];
  mergedRows: number;
  merges: PlaceCsvAdjustment[];
  outsideServiceRows: number;
  warnings: PlaceCsvWarning[];
};
export type PlaceCsvImportResult = PlaceCsvPreview & { inserted: number; updated: number };

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
export function getAdminPlaces(query = '', status = 'all', addressStatus = 'all', page = 1, limit = 20) {
  const params = new URLSearchParams({ q: query, status, addressStatus, page: String(page), limit: String(limit) });
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
export function reverseAdminAddress(lat: number, lng: number) {
  return request<{ address: string; name: string }>('/api/admin/address/reverse', {
    method: 'POST', body: JSON.stringify({ lat, lng }),
  });
}
export function enrichAdminPlaceAddress(id: string) {
  return request<AdminPlace>(`/api/admin/places/${id}/enrich-address`, { method: 'POST' });
}
export function previewAdminPlacesCsv(csv: string, mode: PlaceCsvImportMode) {
  return request<PlaceCsvPreview>(`/api/admin/places/import/preview?mode=${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv;charset=UTF-8' },
    body: csv,
  });
}
export function importAdminPlacesCsv(csv: string, mode: PlaceCsvImportMode) {
  return request<PlaceCsvImportResult>(`/api/admin/places/import/commit?mode=${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv;charset=UTF-8' },
    body: csv,
  });
}
