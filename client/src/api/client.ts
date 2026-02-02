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
  getRole: () => localStorage.getItem('gym_role'),
  setRole: (r: string) => localStorage.setItem('gym_role', r),
  clear: () => {
    localStorage.removeItem('gym_token');
    localStorage.removeItem('gym_tenant_id');
    localStorage.removeItem('gym_role');
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
  tenant: {
    getConfig: (host?: string, tenantId?: string) => {
      const params = new URLSearchParams();
      if (host) params.set('host', host);
      if (tenantId) params.set('tenantId', tenantId);
      const q = params.toString();
      return request<{ name: string; theme: string; logo?: string; backgroundImage?: string; primaryColor?: string }>(
        q ? `/tenants/config?${q}` : '/tenants/config',
      );
    },
  },
  auth: {
    login: (email: string, password: string) =>
      request<{ access_token: string; user: Record<string, unknown> }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
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
  platform: {
    listTenants: () => request<unknown[]>('/platform/tenants'),
    getTenant: (id: string) =>
      request<{
        _id: string;
        name: string;
        slug?: string;
        subdomain?: string;
        customDomain?: string;
        isActive?: boolean;
        defaultTheme?: string;
        branding?: Record<string, unknown>;
        createdAt?: string;
        updatedAt?: string;
        adminUser?: { email: string; name?: string; role: string } | null;
      }>(`/platform/tenants/${id}`),
    createTenant: (dto: { name: string; slug?: string; subdomain?: string; customDomain?: string; adminEmail: string; adminPassword: string; adminName?: string; defaultTheme?: string; branding?: Record<string, unknown> }) =>
      request('/platform/tenants', { method: 'POST', body: JSON.stringify(dto) }),
    updateTenant: (id: string, dto: Record<string, unknown>) =>
      request(`/platform/tenants/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    resetTenantAdmin: (tenantId: string, email: string, newPassword: string) =>
      request(`/platform/tenants/${tenantId}/reset-admin`, {
        method: 'POST',
        body: JSON.stringify({ email, newPassword }),
      }),
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
  enquiries: {
    list: (params?: { status?: string; followUpToday?: boolean; overdue?: boolean; newLast24h?: boolean; search?: string; page?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.set('status', params.status);
      if (params?.followUpToday) sp.set('followUpToday', 'true');
      if (params?.overdue) sp.set('overdue', 'true');
      if (params?.newLast24h) sp.set('newLast24h', 'true');
      if (params?.search) sp.set('search', params.search);
      if (params?.page != null) sp.set('page', String(params.page));
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<{ items: EnquiryListItem[]; total: number; page: number; limit: number; totalPages: number }>(
        q ? `/enquiries?${q}` : '/enquiries',
      );
    },
    getOne: (id: string) =>
      request<EnquiryListItem>(`/enquiries/${id}`),
    create: (data: CreateEnquiryBody) =>
      request<EnquiryListItem>('/enquiries', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: UpdateEnquiryBody) =>
      request<EnquiryListItem>(`/enquiries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    addFollowUp: (id: string, data: { followUpType: string; notes?: string; nextFollowUpDate?: string }) =>
      request<EnquiryFollowUpItem>(`/enquiries/${id}/follow-ups`, { method: 'POST', body: JSON.stringify(data) }),
    getFollowUps: (id: string) =>
      request<EnquiryFollowUpItem[]>(`/enquiries/${id}/follow-ups`),
    markLost: (id: string) =>
      request<{ success: boolean }>(`/enquiries/${id}/lost`, { method: 'PATCH' }),
    convert: (id: string, memberData: Record<string, unknown>) =>
      request<{ member: unknown; enquiry: EnquiryListItem }>(`/enquiries/${id}/convert`, { method: 'POST', body: JSON.stringify(memberData) }),
  },
};

export type EnquirySource = 'Walk-in' | 'Phone' | 'Website' | 'Referral' | 'Social Media';
export type EnquiryStatus = 'New' | 'Follow-up' | 'Converted' | 'Lost';

export interface EnquiryListItem {
  _id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  enquiryDate: string;
  source: EnquirySource;
  interestedPlan?: string;
  notes?: string;
  expectedJoinDate?: string;
  assignedStaff?: string;
  followUpRequired: boolean;
  status: EnquiryStatus;
  convertedMemberId?: string;
  lastFollowUpDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EnquiryFollowUpItem {
  _id: string;
  enquiryId: string;
  followUpDate: string;
  followUpType: 'Call' | 'WhatsApp' | 'Visit';
  notes?: string;
  nextFollowUpDate?: string;
  createdAt?: string;
}

export interface CreateEnquiryBody {
  name: string;
  phoneNumber: string;
  email?: string;
  enquiryDate?: string;
  source: EnquirySource;
  interestedPlan?: string;
  notes?: string;
  expectedJoinDate?: string;
  assignedStaff?: string;
  followUpRequired?: boolean;
}

export interface UpdateEnquiryBody extends Partial<CreateEnquiryBody> {
  status?: EnquiryStatus;
}
