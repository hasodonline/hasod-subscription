/**
 * ServiceCard Component
 * Displays a service with subscription status and action buttons
 */

import { Service, UserServiceSubscription, hasActiveSubscription, getServiceStatus } from '../types/service';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n/translations';

interface ServiceCardProps {
  service: Service;
  subscription?: UserServiceSubscription;
  onSubscribePayPal: (serviceId: string) => void;
  onSubscribeManual: (serviceId: string) => void;
  onManageSubscription?: (serviceId: string) => void;
  loading?: boolean;
  language?: Language;
}

export default function ServiceCard({
  service,
  subscription,
  onSubscribePayPal,
  onSubscribeManual,
  onManageSubscription,
  loading = false,
  language: langProp
}: ServiceCardProps) {
  const { t, language: contextLang } = useLanguage();
  const lang = langProp || contextLang;
  const isHebrew = lang === 'he';

  const status = getServiceStatus(subscription);
  const isActive = hasActiveSubscription(subscription);
  const isPending = status === 'pending';
  const isCanceled = status === 'canceled' || status === 'expired';

  // Get localized service content
  const serviceName = isHebrew ? service.nameHe : service.name;
  const serviceDescription = isHebrew ? service.descriptionHe : service.description;
  const serviceFeatures = isHebrew ? service.featuresHe : service.features;

  const getStatusBadge = () => {
    const statusClasses: Record<string, string> = {
      active: 'badge-success',
      pending: 'badge-warning',
      canceled: 'badge-danger',
      expired: 'badge-danger',
      suspended: 'badge-warning',
      none: 'badge-secondary'
    };
    const className = statusClasses[status] || statusClasses['none'];
    const text = t.subscriptions.status[status as keyof typeof t.subscriptions.status] || t.subscriptions.status.none;
    return <span className={`badge ${className}`}>{text}</span>;
  };

  const getPaymentMethodBadge = () => {
    if (!subscription) return null;

    const methodMap = {
      paypal: { text: t.subscriptions.paymentMethod.paypal, icon: '💳' },
      manual: { text: t.subscriptions.paymentMethod.manual, icon: '💰' }
    };

    const method = methodMap[subscription.paymentMethod] || methodMap.paypal;

    return (
      <span className="payment-method-badge">
        {method.icon} {method.text}
      </span>
    );
  };

  const formatExpiryDate = () => {
    if (!subscription?.manualEndDate) return null;

    const endDate = subscription.manualEndDate.toDate?.() || new Date(subscription.manualEndDate);
    return endDate.toLocaleDateString(isHebrew ? 'he-IL' : 'en-US');
  };

  return (
    <div className={`service-card ${isActive ? 'active' : ''}`}>
      <div className="service-header">
        <h3>{serviceName}</h3>
        <div className="service-badges">
          {getStatusBadge()}
          {getPaymentMethodBadge()}
        </div>
      </div>

      <p className="service-description">{serviceDescription}</p>

      {serviceFeatures && serviceFeatures.length > 0 && (
        <ul className="service-features">
          {serviceFeatures.map((feature, index) => (
            <li key={index}>✓ {feature}</li>
          ))}
        </ul>
      )}

      <div className="service-price">
        <span className="price-amount">${service.pricePerMonth}</span>
        <span className="price-period">{t.subscriptions.perMonth}</span>
      </div>

      {subscription?.manualEndDate && (
        <div className="expiry-info">
          {t.subscriptions.validUntil} {formatExpiryDate()}
        </div>
      )}

      <div className="service-actions">
        {isActive ? (
          <>
            <div className="success-message">
              ✓ {t.subscriptions.hasAccess}
            </div>
            {onManageSubscription && (
              <button
                onClick={() => onManageSubscription(service.id)}
                className="btn-secondary"
                disabled={loading}
              >
                {t.subscriptions.manageSubscription}
              </button>
            )}
          </>
        ) : isPending ? (
          <div className="warning-message">
            {t.subscriptions.waitingPaypal}
          </div>
        ) : isCanceled ? (
          <>
            <div className="info-message">
              {status === 'canceled' ? t.subscriptions.subscriptionCanceled : t.subscriptions.subscriptionExpired}
            </div>
            {service.active && (
              <div className="button-group">
                <button
                  onClick={() => onSubscribePayPal(service.id)}
                  className="btn-primary"
                  disabled={loading || !service.paypalPlanId}
                >
                  {loading ? t.subscriptions.processing : t.subscriptions.subscribePaypal}
                </button>
                <button
                  onClick={() => onSubscribeManual(service.id)}
                  className="btn-secondary"
                  disabled={loading}
                >
                  {t.subscriptions.subscribeManual}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {service.active ? (
              <div className="button-group">
                <button
                  onClick={() => onSubscribePayPal(service.id)}
                  className="btn-primary"
                  disabled={loading || !service.paypalPlanId}
                  title={!service.paypalPlanId ? t.subscriptions.paypalNotConfigured : ''}
                >
                  {loading ? t.subscriptions.processing : t.subscriptions.subscribePaypal}
                </button>
                <button
                  onClick={() => onSubscribeManual(service.id)}
                  className="btn-secondary"
                  disabled={loading}
                >
                  {t.subscriptions.subscribeManual}
                </button>
              </div>
            ) : (
              <div className="info-message">
                {t.subscriptions.comingSoon}
              </div>
            )}
          </>
        )}
      </div>

      {subscription?.paypalSubscriptionId && (
        <div className="subscription-id">
          {t.subscriptions.subscriptionId} {subscription.paypalSubscriptionId}
        </div>
      )}
    </div>
  );
}
