/**
 * Tenant-aware API client.
 * Stores tenantId and token in localStorage after login.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const storage = {
  getToken: () => localStorage.getItem('gym_token'),
  setToken: (t: string) => localStorage.setItem('gym_token', t),
  getTenantId: () => localStorage.getItem('gym_tenant_id'),
  setTenantId: (id: string) => localStorage.setItem('gym_tenant_id', id),
  clear: () => {
    localStorage.removeItem('gym_token');
    localStorage.removeItem('gym_tenant_id');
  },
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tenantId = storage.getTenantId();
  const token = storage.getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string, tenantId: string) =>
      request<{ access_token: string; user: Record<string, unknown> }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'X-Tenant-ID': tenantId },
      }),
    register: (data: { email: string; password: string; name: string }) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  },
  legacy: {
    list: () => request<unknown[]>('/legacy/list'),
    upsert: (newUserData: Record<string, unknown>, deleteFlag = false) =>
      request('/legacy', {
        method: 'POST',
        body: JSON.stringify({ newUserData, deleteFlag }),
      }),
    checkInList: () => request<unknown[]>('/legacy/checkinlist'),
    checkIn: (newUserData: { 'Reg No:': number }) =>
      request('/legacy/checkin', {
        method: 'POST',
        body: JSON.stringify({ newUserData }),
      }),
    backup: () => request<unknown[]>('/legacy/backup'),
    getNextReceiptId: () =>
      request<{ receiptId: string }>('/legacy/next-receipt-id'),
    finance: () =>
      request<{
        monthlyFees: number;
        overallFees: number;
        totalMembers: number;
        activeMembers: number;
        pendingFees: number;
        monthlyGrowth: { month: string; count: number; cumulative: number }[];
        monthlyCollections: { month: string; monthKey: string; amount: number; count: number }[];
      }>('/legacy/finance'),
  },
  followUps: {
    create: (data: { memberId: string; regNo: number; comment: string; nextFollowUpDate?: string }) =>
      request('/follow-ups', { method: 'POST', body: JSON.stringify(data) }),
    getByMember: (memberId: string) =>
      request(`/follow-ups/member/${encodeURIComponent(memberId)}`),
    getBatch: (memberIds: string[]) =>
      memberIds.length === 0
        ? Promise.resolve({})
        : request<Record<string, { comment: string; nextFollowUpDate?: string; createdAt: string }>>(
            '/follow-ups/batch',
            { method: 'POST', body: JSON.stringify({ ids: memberIds }) },
          ),
  },
};
