import { UserServiceSubscription, SubscriptionStatus } from './service';

export type { SubscriptionStatus };

export type UserProfile = {
  uid: string;
  email: string;
  name?: string;
  phone?: string;

  // New multi-service structure
  services?: {
    [serviceId: string]: UserServiceSubscription;
  };

  createdAt?: any;
  updatedAt?: any;

  // Legacy fields (backward compatibility - deprecated)
  paypalSubscriptionId?: string;
  paypalSubscriptionStatus?: SubscriptionStatus;
  inGoogleGroup?: boolean;
};

export function isProfileComplete(user: UserProfile | null): boolean {
  return !!(user?.name && user?.phone);
}

export function hasActiveSubscription(user: UserProfile | null): boolean {
  // Check new services structure
  if (user?.services) {
    return Object.values(user.services).some(service => service.status === 'active');
  }
  // Fallback to legacy field
  return user?.paypalSubscriptionStatus === 'active';
}

export function hasActiveServiceSubscription(
  user: UserProfile | null,
  serviceId: string
): boolean {
  return user?.services?.[serviceId]?.status === 'active';
}

export function getServiceSubscription(
  user: UserProfile | null,
  serviceId: string
): UserServiceSubscription | undefined {
  return user?.services?.[serviceId];
}
