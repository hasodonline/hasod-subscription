/**
 * Subscriptions API
 * API methods for subscription operations
 */

import apiClient from './client';

export interface CreateSubscriptionParams {
  uid: string;
  serviceId: string;
}

export interface CreateSubscriptionResponse {
  approvalUrl: string;
  subscription: any;
  subscriptionId: string;
}

export interface ActivateSubscriptionParams {
  uid: string;
  subscriptionId: string;
}

export interface ActivateSubscriptionResponse {
  success: boolean;
  status: string;
  serviceId: string;
  subscription: any;
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResponse> {
  const response = await apiClient.post('/create-subscription', params);
  return response.data;
}

export async function activateSubscription(
  params: ActivateSubscriptionParams
): Promise<ActivateSubscriptionResponse> {
  const response = await apiClient.post('/activate-subscription', params);
  return response.data;
}

export async function cancelSubscription(uid: string, serviceId: string, reason?: string): Promise<void> {
  await apiClient.post('/admin/cancel-subscription', { uid, serviceId, reason });
}

export async function manageGoogleGroup(
  uid: string,
  serviceId: string,
  action: 'add' | 'remove'
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post('/admin/manage-group', { uid, serviceId, action });
  return response.data;
}
