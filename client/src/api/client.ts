/**
 * Tenant-aware API client.
 * Stores tenantId and token in localStorage after login.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** API origin (e.g. https://gym-saas-api.onrender.com) for Telegram webhook when deployed. */
export function getApiBaseOrigin(): string | undefined {
  if (typeof API_BASE !== 'string' || !API_BASE.startsWith('http')) return undefined;
  try {
    return new URL(API_BASE).origin;
  } catch {
    return undefined;
  }
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true;
  if (e instanceof Error && (e.message === 'Failed to fetch' || e.message === 'Load failed')) return true;
  return false;
}

function networkErrorMessage(): string {
  const base = API_BASE.startsWith('http') ? API_BASE : `${typeof window !== 'undefined' ? window.location.origin : ''}${API_BASE}`;
  return `Cannot reach the server at ${base}. Is the API running? (e.g. npm run start:dev in the project root)`;
}

/** Callbacks for global loader (mask UI during API calls). Set by GlobalLoader on mount. */
let loaderStart: (() => void) | null = null;
let loaderEnd: (() => void) | null = null;
export function setLoaderCallbacks(start: () => void, end: () => void) {
  loaderStart = start;
  loaderEnd = end;
}

export const storage = {
  getToken: () => localStorage.getItem('gym_token'),
  setToken: (t: string) => localStorage.setItem('gym_token', t),
  getTenantId: () => localStorage.getItem('gym_tenant_id'),
  setTenantId: (id: string) => localStorage.setItem('gym_tenant_id', id),
  getRole: () => localStorage.getItem('gym_role'),
  setRole: (r: string) => localStorage.setItem('gym_role', r),
  getUserName: () => localStorage.getItem('gym_user_name'),
  setUserName: (name: string) => localStorage.setItem('gym_user_name', name),
  clear: () => {
    localStorage.removeItem('gym_token');
    localStorage.removeItem('gym_tenant_id');
    localStorage.removeItem('gym_role');
    localStorage.removeItem('gym_user_name');
  },
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  loaderStart?.();
  try {
    const tenantId = storage.getTenantId();
    const token = storage.getToken();

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (tenantId) headers['X-Tenant-ID'] = tenantId;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      text = await res.text();
    } catch (e) {
      if (isNetworkError(e)) throw new Error(networkErrorMessage());
      throw e;
    }
    if (!res.ok) {
      throw new Error(text || res.statusText);
    }
    if (!text || text.trim() === '') {
      return null as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Invalid JSON response');
    }
  } finally {
    loaderEnd?.();
  }
}

/** Public API call (no auth headers). Used for QR check-in page. */
async function requestPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    text = await res.text();
  } catch (e) {
    if (isNetworkError(e)) throw new Error(networkErrorMessage());
    throw e;
  }
  if (!res.ok) throw new Error(text || res.statusText);
  if (!text || text.trim() === '') return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

/** Parse API error response for display. Handles NestJS ValidationPipe: message can be string or string[]. */
export function getApiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const obj = JSON.parse(raw) as { message?: string | string[]; error?: string };
    if (obj.message != null) {
      if (Array.isArray(obj.message)) {
        const joined = obj.message.filter((m) => typeof m === 'string').join('. ');
        if (joined) return joined;
      }
      if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    }
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
  } catch {
    // not JSON
  }
  return raw || 'Something went wrong.';
}

export const api = {
  tenant: {
    getConfig: (host?: string, tenantId?: string) => {
      const params = new URLSearchParams();
      if (host) params.set('host', host);
      if (tenantId) params.set('tenantId', tenantId);
      const q = params.toString();
      return request<{
        name: string;
        theme: string;
        logo?: string;
        backgroundImage?: string;
        primaryColor?: string;
        allowsMedicalDocuments?: boolean;
        medicalDocumentsLimit?: number;
      }>(q ? `/tenants/config?${q}` : '/tenants/config');
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
    onboardUser: (data: { email: string; password: string; name: string; role?: 'STAFF' | 'MANAGER' }) =>
      request<{ _id: string; email: string; name: string; role: string }>('/auth/onboard-user', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onboardMember: (data: { email: string; password: string; name?: string; regNo: number }) =>
      request<{ _id: string; email: string; name: string; role: string }>('/auth/onboard-member', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMe: () =>
      request<{ id: string; email: string; name?: string; role: string; tenantId: string; createdAt?: string; linkedRegNo?: number }>('/auth/me'),
    getAiMembers: (search?: string) => {
      const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      return request<AiMember[]>(`/auth/ai-members${q}`);
    },
    resetMemberPassword: (userId: string, newPassword: string) =>
      request<{ message: string; newPassword: string }>('/auth/reset-member-password', {
        method: 'POST',
        body: JSON.stringify({ userId, newPassword }),
      }),
    deactivateMemberUser: (userId: string) =>
      request<{ message: string }>(`/auth/member-users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
  },
  legacy: {
    lookup: (gymId?: string, regNo?: string) => {
      const params = new URLSearchParams();
      if (gymId) params.set('gymId', gymId);
      if (regNo) params.set('regNo', regNo);
      const q = params.toString();
      return request<Record<string, unknown> | null>(q ? `/legacy/lookup?${q}` : '/legacy/lookup');
    },
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
  attendance: {
    qrPayload: () =>
      request<{ url: string; token: string }>('/attendance/qr-payload'),
    getCheckInQRMembers: (token: string) =>
      requestPublic<{ members: { regNo: number; name: string }[] }>(`/attendance/checkin-qr-members?t=${encodeURIComponent(token)}`),
    checkInByQR: (token: string, regNo: number) =>
      requestPublic<{ success: boolean; name?: string }>('/attendance/checkin-qr', {
        method: 'POST',
        body: JSON.stringify({ token, regNo }),
      }),
    removeTodayCheckIn: (regNo: number) =>
      request<unknown>('/attendance/remove-today', { method: 'POST', body: JSON.stringify({ regNo }) }),
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
        telegramBotToken?: string;
        telegramChatId?: string;
        telegramGroupInviteLink?: string;
        createdAt?: string;
        updatedAt?: string;
        adminUser?: { email: string; name?: string; role: string } | null;
      }>(`/platform/tenants/${id}`),
    /** Preview Telegram config for a tenant (same as gym GET /notifications/telegram-config). */
    getTenantTelegramConfig: (tenantId: string) =>
      request<{ groupInviteLink?: string; hasBot: boolean }>(`/platform/tenants/${encodeURIComponent(tenantId)}/telegram-config`),
    createTenant: (dto: { name: string; slug?: string; subdomain?: string; customDomain?: string; adminEmail: string; adminPassword: string; adminName?: string; defaultTheme?: string; branding?: Record<string, unknown>; telegramBotToken?: string; telegramChatId?: string; telegramGroupInviteLink?: string }) =>
      request('/platform/tenants', { method: 'POST', body: JSON.stringify(dto) }),
    updateTenant: (id: string, dto: Record<string, unknown>) =>
      request(`/platform/tenants/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    resetTenantAdmin: (tenantId: string, email: string, newPassword: string) =>
      request(`/platform/tenants/${tenantId}/reset-admin`, {
        method: 'POST',
        body: JSON.stringify({ email, newPassword }),
      }),
    /** Download pitch PDF for a tenant (SUPER_ADMIN). Fetches blob and triggers browser download. */
    downloadTenantPitchPdf: async (tenantId: string): Promise<void> => {
      const token = storage.getToken();
      const tenantIdHeader = storage.getTenantId();
      const API_BASE = import.meta.env.VITE_API_URL || '/api';
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (tenantIdHeader) headers['X-Tenant-ID'] = tenantIdHeader;
      const res = await fetch(`${API_BASE}/platform/tenants/${encodeURIComponent(tenantId)}/pitch-pdf`, { headers });
      if (!res.ok) throw new Error(res.statusText || 'Failed to download PDF');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition && /filename="?([^";\n]+)"?/.exec(disposition);
      const fileName = match ? match[1].trim() : `pitch-${tenantId}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
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
  calories: {
    chat: (
      message: string,
      date?: string,
      existingItems?: { name: string; quantity?: string; estimatedCalories: number }[],
    ) =>
      request<CalorieChatResult>('/calories/chat', {
        method: 'POST',
        body: JSON.stringify({ message, date, existingItems }),
      }),
    setEntry: (date: string, items: { name: string; quantity?: string; estimatedCalories: number }[]) =>
      request<CalorieEntry>('/calories/entry', {
        method: 'PATCH',
        body: JSON.stringify({ date, items }),
      }),
    getToday: () => request<CalorieEntry | null>('/calories/today'),
    getLast7Days: () => request<CalorieDaySummary[]>('/calories/last-7-days'),
    getHistory: (from: string, to: string) => {
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      return request<CalorieHistoryEntry[]>(`/calories/history?${params.toString()}`);
    },
    acceptDefault: (date: string, gender?: 'male' | 'female') =>
      request<CalorieEntry>('/calories/accept-default', {
        method: 'POST',
        body: JSON.stringify({ date, gender }),
      }),
    getMemberToday: (memberUserId: string) =>
      request<CalorieEntry | null>(`/calories/member/${encodeURIComponent(memberUserId)}/today`),
    getMemberLast7Days: (memberUserId: string) =>
      request<CalorieDaySummary[]>(`/calories/member/${encodeURIComponent(memberUserId)}/last-7-days`),
    getMemberHistory: (memberUserId: string, from: string, to: string) => {
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      return request<CalorieHistoryEntry[]>(
        `/calories/member/${encodeURIComponent(memberUserId)}/history?${params.toString()}`,
      );
    },
    analyze: (meals: { food: string; quantity: string; unit: string }[], date?: string, userProfile?: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string }) =>
      request<NutritionAnalysisResult>('/calories/analyze', {
        method: 'POST',
        body: JSON.stringify({ meals, date, userProfile }),
      }),
    getAnalysis: (date: string) => {
      const params = new URLSearchParams();
      params.set('date', date);
      return request<NutritionAnalysisResult | null>(`/calories/analysis?${params.toString()}`);
    },
    getMemberAnalysis: (memberUserId: string, date: string) => {
      const params = new URLSearchParams();
      params.set('date', date);
      return request<NutritionAnalysisResult | null>(
        `/calories/member/${encodeURIComponent(memberUserId)}/analysis?${params.toString()}`,
      );
    },
    getReferenceFoods: () => request<ReferenceFood[]>('/calories/reference-foods'),
    getProfile: () =>
      request<{ age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string }>('/calories/profile'),
    saveProfile: (profile: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string }) =>
      request<{ success: boolean }>('/calories/profile', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
  },
  medicalHistory: {
    getMine: () =>
      request<{
        bloodGroup?: string;
        allergies?: string[];
        conditions?: string[];
        medications?: string[];
        injuries?: string[];
        notes?: string;
        emergencyContactName?: string;
        emergencyContactPhone?: string;
        updatedAt?: string;
      } | null>('/medical-history'),
    saveMine: (data: {
      bloodGroup?: string;
      allergies?: string[];
      conditions?: string[];
      medications?: string[];
      injuries?: string[];
      notes?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    }) =>
      request('/medical-history', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listDocuments: () =>
      request<Array<{ _id: string; originalName: string; label?: string; mimeType?: string; size?: number; uploadedAt: string }>>(
        '/medical-history/documents',
      ),
    getDocument: (id: string) =>
      request<{ url: string; originalName: string; label?: string; mimeType?: string }>(`/medical-history/documents/${encodeURIComponent(id)}`),
    uploadDocument: (file: File, label?: string) => {
      const form = new FormData();
      form.append('file', file);
      if (label != null && String(label).trim()) form.append('label', String(label).trim());
      return request<{ _id: string; originalName: string; label?: string; mimeType: string; size: number; url: string; uploadedAt: string }>(
        '/medical-history/documents',
        { method: 'POST', body: form },
      );
    },
    deleteDocument: (id: string) =>
      request<{ success: boolean }>(`/medical-history/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  workoutPlan: {
    getMine: () =>
      request<{ name: string; days: { dayOfWeek: number; label: string }[]; updatedAt?: string } | null>('/workout-plan'),
    upsertMine: (data: { name?: string; days?: { dayOfWeek: number; label: string }[] }) =>
      request<{ name: string; days: { dayOfWeek: number; label: string }[]; updatedAt: string }>('/workout-plan', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getLogs: (params?: { from?: string; to?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set('from', params.from);
      if (params?.to) sp.set('to', params.to);
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<Array<{ _id: string; date: string; workoutLabel: string; notes?: string; durationMinutes?: number; createdAt: string }>>(
        q ? `/workout-plan/logs?${q}` : '/workout-plan/logs',
      );
    },
    createLog: (data: { date: string; workoutLabel: string; notes?: string; durationMinutes?: number }) =>
      request<{ _id: string; date: string; workoutLabel: string; notes?: string; durationMinutes?: number; createdAt: string }>('/workout-plan/logs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteLog: (id: string) =>
      request<{ success: boolean }>(`/workout-plan/logs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  notifications: {
    runAbsence: () =>
      request<{ sent: number; skipped: number }>('/notifications/run-absence', { method: 'POST' }),
    listTelegramAttempts: (params?: { status?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.set('status', params.status);
      if (params?.limit != null) sp.set('limit', String(params.limit));
      const q = sp.toString();
      return request<Array<{ _id: string; telegramChatId: string; phoneAttempted?: string; messageText?: string; memberId?: string; status: string; createdAt: string }>>(
        q ? `/notifications/telegram-attempts?${q}` : '/notifications/telegram-attempts',
      );
    },
    deleteTelegramAttempt: (id: string) =>
      request<{ ok: boolean; error?: string }>(`/notifications/telegram-attempts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    getTelegramConfig: () =>
      request<{ groupInviteLink?: string; hasBot: boolean }>('/notifications/telegram-config'),
    registerWebhook: (webhookUrl?: string) =>
      request<{ ok: boolean; error?: string; webhookUrl?: string | null; tenantId?: string | null }>('/notifications/register-webhook', {
        method: 'POST',
        body: JSON.stringify(
          webhookUrl != null && webhookUrl.trim() !== ''
            ? { webhookUrl: webhookUrl.trim() }
            : { suggestedBaseUrl: getApiBaseOrigin() },
        ),
      }),
    getWebhookInfo: () =>
      request<{ tenantId: string; webhookPath: string; webhookUrl: string | null }>('/notifications/webhook-info'),
    getVapidPublicKey: () =>
      request<{ publicKey: string | null }>('/notifications/vapid-public-key'),
    savePushSubscription: (subscription: PushSubscriptionJSON, userAgent?: string) =>
      request<{ ok: boolean; error?: string }>('/notifications/push-subscription', {
        method: 'POST',
        body: JSON.stringify({ subscription, userAgent: userAgent ?? navigator.userAgent }),
      }),
    removePushSubscription: () =>
      request<{ ok: boolean; deleted?: number; error?: string }>('/notifications/push-subscription', {
        method: 'DELETE',
      }),
  },
};

export interface ReferenceFood {
  id: string;
  name: string;
  defaultUnit: string;
  units: string[];
}

export interface FoodNutritionBreakdown {
  name: string;
  quantity: string;
  unit: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
}

export interface NutrientStatus {
  nutrient: string;
  status: 'deficient' | 'slightly_low' | 'optimal' | 'excess';
  message?: string;
  current?: number;
  recommended?: number;
  unit?: string;
}

export interface ImprovementRecommendation {
  title?: string;
  foods: string[];
  portions?: string[];
  swaps?: string[];
}

export interface NutritionAnalysisResult {
  perFood: FoodNutritionBreakdown[];
  dailyTotal: { calories: number; protein: number; carbohydrates: number; fat: number; fiber: number; vitamins?: Record<string, number>; minerals?: Record<string, number> };
  rdiPercentage: Record<string, number | Record<string, number>>;
  deficiencies: NutrientStatus[];
  suggestions: string[];
  improvements: ImprovementRecommendation[];
}

export interface AiMember {
  id: string;
  email: string;
  name?: string;
  linkedRegNo?: number;
  createdAt?: string;
}

export interface CalorieHistoryEntry {
  date: string;
  totalCalories: number;
  source: 'user' | 'system';
  isSystemEstimated: boolean;
  detailsJson?: { items?: { name: string; quantity?: string; estimatedCalories: number }[]; rawMessage?: string };
}

export interface CalorieEntry {
  _id?: string;
  tenantId: string;
  userId: string;
  date: string;
  source: 'user' | 'system';
  totalCalories: number;
  detailsJson?: { items?: { name: string; quantity?: string; estimatedCalories: number }[]; rawMessage?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface CalorieChatResult {
  date: string;
  items: { name: string; quantity?: string; estimatedCalories: number }[];
  totalCalories: number;
  source: 'user';
}

export interface CalorieDaySummary {
  date: string;
  totalCalories: number;
  source: 'user' | 'system';
  isSystemEstimated: boolean;
  hasEntry: boolean;
}

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
