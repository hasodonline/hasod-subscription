/**
 * Services API
 * API methods for service-related operations
 */

import apiClient from './client';
import { Service } from '../types/service';

export async function getServices(): Promise<Service[]> {
  const response = await apiClient.get('/services');
  return response.data.services;
}

export async function getService(serviceId: string): Promise<Service> {
  const response = await apiClient.get(`/services/${serviceId}`);
  return response.data.service;
}

export async function createOrUpdateService(service: Partial<Service>): Promise<{ serviceId: string }> {
  const response = await apiClient.post('/admin/services', { service });
  return response.data;
}

export async function deleteService(serviceId: string): Promise<void> {
  await apiClient.delete(`/admin/services/${serviceId}`);
}
