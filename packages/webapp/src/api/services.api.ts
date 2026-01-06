/**
 * Services API
 * API methods for service-related operations
 *
 * Types are generated from OpenAPI spec - see packages/api-spec/openapi.yaml
 */

import apiClient from './client';
import type { components, operations } from './schema';

// Re-export types for convenience
export type Service = components['schemas']['Service'];
export type ServicesResponse = components['schemas']['ServicesResponse'];
export type ServiceResponse = components['schemas']['ServiceResponse'];
export type AdminServiceRequest = components['schemas']['AdminServiceRequest'];
export type AdminServiceResponse = components['schemas']['AdminServiceResponse'];

export async function getServices(): Promise<Service[]> {
  const response = await apiClient.get<ServicesResponse>('/services');
  return response.data.services;
}

export async function getService(serviceId: string): Promise<Service> {
  const response = await apiClient.get<ServiceResponse>(`/services/${serviceId}`);
  return response.data.service;
}

export async function createOrUpdateService(
  service: AdminServiceRequest['service']
): Promise<AdminServiceResponse> {
  const response = await apiClient.post<AdminServiceResponse>('/admin/services', { service });
  return response.data;
}

export async function deleteService(serviceId: string): Promise<void> {
  await apiClient.delete(`/admin/services/${serviceId}`);
}
