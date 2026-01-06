/**
 * Subscriptions API
 * API methods for subscription operations
 *
 * Types are generated from OpenAPI spec - see packages/api-spec/openapi.yaml
 */

import apiClient from './client';
import type { components } from './schema';

// Re-export types for convenience
export type CreateSubscriptionRequest = components['schemas']['CreateSubscriptionRequest'];
export type CreateSubscriptionResponse = components['schemas']['CreateSubscriptionResponse'];
export type ActivateSubscriptionRequest = components['schemas']['ActivateSubscriptionRequest'];
export type ActivateSubscriptionResponse = components['schemas']['ActivateSubscriptionResponse'];
export type CancelSubscriptionRequest = components['schemas']['CancelSubscriptionRequest'];
export type ManageGroupRequest = components['schemas']['ManageGroupRequest'];
export type SuccessResponse = components['schemas']['SuccessResponse'];

export async function createSubscription(
  params: CreateSubscriptionRequest
): Promise<CreateSubscriptionResponse> {
  const response = await apiClient.post<CreateSubscriptionResponse>('/create-subscription', params);
  return response.data;
}

export async function activateSubscription(
  params: ActivateSubscriptionRequest
): Promise<ActivateSubscriptionResponse> {
  const response = await apiClient.post<ActivateSubscriptionResponse>('/activate-subscription', params);
  return response.data;
}

export async function cancelSubscription(
  uid: string,
  serviceId: string,
  reason?: string
): Promise<SuccessResponse> {
  const response = await apiClient.post<SuccessResponse>('/admin/cancel-subscription', {
    uid,
    serviceId,
    reason,
  });
  return response.data;
}

export async function manageGoogleGroup(
  uid: string,
  serviceId: string,
  action: 'add' | 'remove'
): Promise<SuccessResponse> {
  const response = await apiClient.post<SuccessResponse>('/admin/manage-group', {
    uid,
    serviceId,
    action,
  });
  return response.data;
}
