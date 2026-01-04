/**
 * Subscriptions Page
 * Multi-service subscription management
 */

import { useState, useEffect } from 'react';
import { UserProfile, getServiceSubscription } from '../types/user';
import { Service } from '../types/service';
import ServiceCard from '../components/ServiceCard';
import { useServices } from '../hooks/useServices';
import { createSubscription } from '../api/subscriptions.api';

type Props = {
  uid: string;
  profile: UserProfile | null;
};

const MANUAL_PAYMENT_CONTACT = `לתשלום ידני, צור קשר:

📞 טלפון: 054-123-4567
📧 אימייל: hasod@hasodonline.com

אפשרויות תשלום:
• מזומן
• העברה בנקאית
• ביט/פייבוקס

לאחר התשלום, המנהל יפעיל את השירות עבורך תוך 24 שעות.`;

export default function Subscriptions({ uid, profile }: Props) {
  const { services, loading: servicesLoading } = useServices(false); // Get all services including inactive
  const [loadingServiceId, setLoadingServiceId] = useState<string | null>(null);

  async function handleSubscribePayPal(serviceId: string) {
    setLoadingServiceId(serviceId);

    try {
      const service = services.find(s => s.id === serviceId);

      if (!service?.paypalPlanId) {
        alert('שירות זה אינו זמין כרגע דרך PayPal. אנא השתמש בתשלום ידני.');
        return;
      }

      const result = await createSubscription({ uid, serviceId });

      if (result.approvalUrl) {
        // Redirect to PayPal for approval
        window.location.href = result.approvalUrl;
      } else {
        alert('לא התקבל קישור לאישור מ-PayPal. אנא נסה שוב.');
      }
    } catch (error: any) {
      console.error('Error creating subscription:', error);

      if (error.code === 'ERR_NETWORK') {
        alert('שירות המנויים אינו זמין כרגע. אנא נסה שוב מאוחר יותר.');
      } else {
        const errorMsg = error.response?.data?.error || error.message || 'שגיאה לא ידועה';
        alert('שגיאה ביצירת מנוי: ' + errorMsg);
      }
    } finally {
      setLoadingServiceId(null);
    }
  }

  function handleSubscribeManual(serviceId: string) {
    const service = services.find(s => s.id === serviceId);
    alert(MANUAL_PAYMENT_CONTACT + `\n\nשירות: ${service?.nameHe || serviceId}`);
  }

  if (servicesLoading) {
    return (
      <div className="subscriptions-page">
        <div className="loading">טוען שירותים...</div>
      </div>
    );
  }

  return (
    <div className="subscriptions-page">
      <h2>מנויי הסוד אונליין</h2>

      {services.length === 0 ? (
        <div className="no-services">
          <p>אין שירותים זמינים כרגע</p>
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
              />
            );
          })}
        </div>
      )}

      <div className="subscriptions-footer">
        <p className="help-text">
          זקוק לעזרה? צור קשר: hasod@hasodonline.com
        </p>
      </div>
    </div>
  );
}
