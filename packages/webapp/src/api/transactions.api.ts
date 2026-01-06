/**
 * Transactions API
 * API methods for manual payment transactions
 *
 * Types are generated from OpenAPI spec - see packages/api-spec/openapi.yaml
 */

import apiClient from './client';
import type { components } from './schema';

// Re-export types for convenience
export type ManualPaymentRequest = components['schemas']['ManualPaymentRequest'];
export type ManualPaymentResponse = components['schemas']['ManualPaymentResponse'];
export type ManualTransaction = components['schemas']['ManualTransaction'];
export type TransactionsResponse = components['schemas']['TransactionsResponse'];

export async function processManualPayment(
  params: ManualPaymentRequest
): Promise<ManualPaymentResponse> {
  const response = await apiClient.post<ManualPaymentResponse>('/admin/manual-payment', params);
  return response.data;
}

export async function getUserTransactions(userId: string): Promise<ManualTransaction[]> {
  const response = await apiClient.get<TransactionsResponse>(
    `/admin/manual-transactions/${userId}`
  );
  return response.data.transactions;
}

export async function getAllTransactions(filters?: {
  serviceId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ManualTransaction[]> {
  const params = new URLSearchParams();
  if (filters?.serviceId) params.append('serviceId', filters.serviceId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const response = await apiClient.get<TransactionsResponse>(
    `/admin/manual-transactions?${params.toString()}`
  );
  return response.data.transactions;
}
