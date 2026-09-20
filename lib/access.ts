export type FeatureFlags = {
  aiEnabled: boolean;
  financialEnabled: boolean;
  stockEnabled: boolean;
  whatsappEnabled: boolean;
  appointmentsEnabled: boolean;
};

export type AccessContext = {
  authenticated: boolean;
  userId: string | null;
  platformRole: "USER" | "SUPER_ADMIN";
  isSuperAdmin: boolean;
  globalMaintenance: boolean;
  maintenanceMessage?: string | null;
  registrationEnabled: boolean;
  maxCompanies: number;
  publicAppUrl?: string | null;
  company: null | {
    id: string;
    name: string;
    slug: string;
    role: "OWNER" | "ADMIN" | "TECHNICIAN" | "ATTENDANT";
    status:
      | "TRIAL"
      | "ACTIVE"
      | "PAST_DUE"
      | "SUSPENDED"
      | "CANCELED"
      | "PENDING_DELETION";
    maintenance: boolean;
    maintenanceMessage?: string | null;
    scheduledDeletionAt?: string | null;
    featureFlags: FeatureFlags;
  };
  subscription: null | {
    id: string;
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
    startedAt: string;
    trialEndsAt?: string | null;
    nextBillingDate?: string | null;
    cancelledAt?: string | null;
  };
};

export const defaultFeatures: FeatureFlags = {
  aiEnabled: false,
  financialEnabled: false,
  stockEnabled: false,
  whatsappEnabled: false,
  appointmentsEnabled: true,
};
