/**
 * Subscriptions Page
 * Multi-service subscription management
 */

import { useState } from 'react';
import { UserProfile, getServiceSubscription } from '../types/user';
import ServiceCard from '../components/ServiceCard';
import { useServices } from '../hooks/useServices';
import { createSubscription } from '../api/subscriptions.api';
import { useLanguage } from '../i18n/LanguageContext';

type Props = {
  uid: string;
  profile: UserProfile | null;
};

export default function Subscriptions({ uid, profile }: Props) {
  const { services, loading: servicesLoading } = useServices(false); // Get all services including inactive
  const [loadingServiceId, setLoadingServiceId] = useState<string | null>(null);
  const { t, language } = useLanguage();

  async function handleSubscribePayPal(serviceId: string) {
    setLoadingServiceId(serviceId);

    try {
      const service = services.find(s => s.id === serviceId);

      if (!service?.paypalPlanId) {
        alert(t.subscriptions.errors.paypalNotAvailable);
        return;
      }

      const result = await createSubscription({ uid, serviceId });

      if (result.approvalUrl) {
        // Redirect to PayPal for approval
        window.location.href = result.approvalUrl;
      } else {
        alert(t.subscriptions.errors.noApprovalUrl);
      }
    } catch (error: any) {
      console.error('Error creating subscription:', error);

      if (error.code === 'ERR_NETWORK') {
        alert(t.subscriptions.errors.serviceUnavailable);
      } else {
        const errorMsg = error.response?.data?.error || error.message || t.common.error;
        alert(t.subscriptions.errors.createSubscription + ' ' + errorMsg);
      }
    } finally {
      setLoadingServiceId(null);
    }
  }

  function handleSubscribeManual(serviceId: string) {
    const service = services.find(s => s.id === serviceId);
    const serviceName = language === 'he' ? service?.nameHe : service?.name;
    alert(t.subscriptions.manualPaymentContact + `\n\nService: ${serviceName || serviceId}`);
  }

  if (servicesLoading) {
    return (
      <div className="subscriptions-page">
        <div className="loading">{t.subscriptions.loadingServices}</div>
      </div>
    );
  }

  return (
    <div className="subscriptions-page">
      <h2>{t.subscriptions.title}</h2>

      {services.length === 0 ? (
        <div className="no-services">
          <p>{t.subscriptions.noServices}</p>
        </div>
      ) : (
        <div className="services-grid">
          {services.map(service => {
            const subscription = getServiceSubscription(profile, service.id);

            return (
              <ServiceCard
                key={service.id}
                service={service}
                subscription={subscription}
                onSubscribePayPal={handleSubscribePayPal}
                onSubscribeManual={handleSubscribeManual}
                loading={loadingServiceId === service.id}
                language={language}
              />
            );
          })}
        </div>
      )}

      <div className="subscriptions-footer">
        <p className="help-text">
          {t.subscriptions.helpText} hasod@hasodonline.com
        </p>
      </div>
    </div>
  );
}
