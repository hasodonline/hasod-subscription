/**
 * Services Hook
 * Manages fetching and caching of available services
 */

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Service } from '../types/service';

export function useServices(activeOnly: boolean = false) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, [activeOnly]);

  async function loadServices() {
    try {
      setLoading(true);
      setError(null);

      let q = query(collection(db, 'services'), orderBy('order'));

      if (activeOnly) {
        q = query(q, where('active', '==', true));
      }

      const snapshot = await getDocs(q);
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];

      setServices(servicesData);
    } catch (err: any) {
      console.error('Error loading services:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return { services, loading, error, reload: loadServices };
}
