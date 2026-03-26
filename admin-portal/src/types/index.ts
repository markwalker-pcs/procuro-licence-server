// Shared types matching the Prisma schema

export type DeploymentModel = 'SAAS' | 'HYBRID' | 'ON_PREMISES';
export type LicenceStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED';
export type LicenceType = 'PER_USER' | 'CONCURRENT';
export type CheckInStatus = 'VALID' | 'WARNING' | 'EXPIRED' | 'INVALID';
export type AdminRole = 'ADMIN' | 'ENGINEER' | 'READ_ONLY';

export interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  primaryContact: string | null;
  deploymentModel: DeploymentModel;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  licences?: Licence[];
}

export type AmendmentType = 'USER_INCREASE' | 'USER_DECREASE' | 'RENEWAL' | 'EXPIRY_EXTENSION' | 'TYPE_CHANGE';

export interface Licence {
  id: string;
  customerId: string;
  licenceKey: string;
  licenceType: LicenceType;
  licensedUsers: number;
  gracePeriodDays: number;
  expiryDate: string;
  status: LicenceStatus;
  deploymentModel: DeploymentModel;
  invoiceReference: string | null;
  createdBy: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; deploymentModel: DeploymentModel };
  _count?: { instances: number };
}

export interface LicenceAmendment {
  id: string;
  licenceId: string;
  amendmentType: AmendmentType;
  previousUsers: number;
  newUsers: number;
  previousType: LicenceType | null;
  newType: LicenceType | null;
  invoiceReference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Instance {
  id: string;
  licenceId: string;
  instanceUuid: string;
  softwareVersion: string | null;
  lastCheckIn: string | null;
  activeUsers: number;
  ipAddress: string | null;
  createdAt: string;
  licence?: {
    id: string;
    licenceKey: string;
    licensedUsers: number;
    status: LicenceStatus;
    customer: { id: string; name: string };
  };
}

export interface CheckIn {
  id: string;
  instanceId: string;
  timestamp: string;
  activeUsers: number;
  softwareVersion: string;
  responseStatus: CheckInStatus;
  ipAddress: string | null;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  timestamp: string;
  user?: { displayName: string; email: string };
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
}

export interface DashboardStats {
  totalCustomers: number;
  totalLicences: number;
  activeLicences: number;
  totalInstances: number;
  offlineInstances: number;
  expiringLicences: number;
}

export interface OfflineFile {
  id: string;
  licenceId: string;
  issuedAt: string;
  expiresAt: string;
  generatedBy: string;
  fileHash: string;
}

export interface Alert {
  instanceId?: string;
  instanceUuid?: string;
  licenceId?: string;
  lastCheckIn?: string;
  expiryDate?: string;
  customer: string;
  severity: 'warning' | 'critical';
}
