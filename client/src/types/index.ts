export interface Member {
  _id?: string;
  'Reg No:': number;
  NAME: string;
  Gender?: string;
  'Date of Joining'?: string | number;
  'Phone Number'?: string | number;
  'Typeof pack'?: string;
  'DUE DATE'?: number;
  memberId?: string;
  status?: 'expired' | 'soon' | 'valid' | 'new';
  dueDate?: Date | null;
  joinDate?: Date | null;
  [key: string]: unknown;
}

export interface FollowUp {
  comment: string;
  nextFollowUpDate?: string;
  createdAt: string;
}

export interface FinanceSummary {
  monthlyFees: number;
  overallFees: number;
  totalMembers: number;
  activeMembers: number;
  pendingFees: number;
  monthlyGrowth?: { month: string; count: number; cumulative: number }[];
}
