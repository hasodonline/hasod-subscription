/**
 * Transactions API
 * API methods for manual payment transactions
 */

import apiClient from './client';

export interface ProcessManualPaymentParams {
  userEmail: string;
  serviceId: string;
  amount: number;
  durationMonths: number;
  paymentMethod: 'cash' | 'bank-transfer' | 'other';
  notes?: string;
  receiptNumber?: string;
  processedByUid: string;
  processedByEmail: string;
}

export interface ManualTransaction {
  id: string;
  userId: string;
  userEmail: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  currency: string;
  durationMonths: number;
  startDate: any;
  endDate: any;
  notes: string;
  processedBy: string;
  processedByEmail: string;
  createdAt: any;
  paymentMethod: string;
  receiptNumber?: string;
}

export async function processManualPayment(
  params: ProcessManualPaymentParams
): Promise<{ transactionId: string; userId: string }> {
  const response = await apiClient.post('/admin/manual-payment', params);
  return response.data;
}

export async function getUserTransactions(userId: string): Promise<ManualTransaction[]> {
  const response = await apiClient.get(`/admin/manual-transactions/${userId}`);
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

  const response = await apiClient.get(`/admin/manual-transactions?${params.toString()}`);
  return response.data.transactions;
}
