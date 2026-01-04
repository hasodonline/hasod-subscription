/**
 * ServiceCard Component
 * Displays a service with subscription status and action buttons
 */

import { Service, UserServiceSubscription, hasActiveSubscription, getServiceStatus } from '../types/service';

interface ServiceCardProps {
  service: Service;
  subscription?: UserServiceSubscription;
  onSubscribePayPal: (serviceId: string) => void;
  onSubscribeManual: (serviceId: string) => void;
  onManageSubscription?: (serviceId: string) => void;
  loading?: boolean;
}

export default function ServiceCard({
  service,
  subscription,
  onSubscribePayPal,
  onSubscribeManual,
  onManageSubscription,
  loading = false
}: ServiceCardProps) {
  const status = getServiceStatus(subscription);
  const isActive = hasActiveSubscription(subscription);
  const isPending = status === 'pending';
  const isCanceled = status === 'canceled' || status === 'expired';

  const getStatusBadge = () => {
    const statusMap: Record<string, { text: string; className: string }> = {
      active: { text: 'פעיל', className: 'badge-success' },
      pending: { text: 'ממתין לאישור', className: 'badge-warning' },
      canceled: { text: 'בוטל', className: 'badge-danger' },
      expired: { text: 'פג תוקף', className: 'badge-danger' },
      suspended: { text: 'מושהה', className: 'badge-warning' },
      none: { text: 'לא פעיל', className: 'badge-secondary' }
    };
    const info = statusMap[status] || statusMap['none'];
    return <span className={`badge ${info.className}`}>{info.text}</span>;
  };

  const getPaymentMethodBadge = () => {
    if (!subscription) return null;

    const methodMap = {
      paypal: { text: 'PayPal', icon: '💳' },
      manual: { text: 'תשלום ידני', icon: '💰' }
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
    return endDate.toLocaleDateString('he-IL');
  };

  return (
    <div className={`service-card ${isActive ? 'active' : ''}`}>
      <div className="service-header">
        <h3>{service.nameHe}</h3>
        <div className="service-badges">
          {getStatusBadge()}
          {getPaymentMethodBadge()}
        </div>
      </div>

      <p className="service-description">{service.descriptionHe}</p>

      {service.featuresHe && service.featuresHe.length > 0 && (
        <ul className="service-features">
          {service.featuresHe.map((feature, index) => (
            <li key={index}>✓ {feature}</li>
          ))}
        </ul>
      )}

      <div className="service-price">
        <span className="price-amount">${service.pricePerMonth}</span>
        <span className="price-period">/חודש</span>
      </div>

      {subscription?.manualEndDate && (
        <div className="expiry-info">
          תוקף עד: {formatExpiryDate()}
        </div>
      )}

      <div className="service-actions">
        {isActive ? (
          <>
            <div className="success-message">
              ✓ יש לך גישה לשירות זה
            </div>
            {onManageSubscription && (
              <button
                onClick={() => onManageSubscription(service.id)}
                className="btn-secondary"
                disabled={loading}
              >
                נהל מנוי
              </button>
            )}
          </>
        ) : isPending ? (
          <div className="warning-message">
            ממתין לאישור התשלום ב-PayPal
          </div>
        ) : isCanceled ? (
          <>
            <div className="info-message">
              המנוי {status === 'canceled' ? 'בוטל' : 'פג תוקף'}. הירשם שוב לקבל גישה.
            </div>
            {service.active && (
              <div className="button-group">
                <button
                  onClick={() => onSubscribePayPal(service.id)}
                  className="btn-primary"
                  disabled={loading || !service.paypalPlanId}
                >
                  {loading ? 'מעבד...' : 'הירשם ב-PayPal'}
                </button>
                <button
                  onClick={() => onSubscribeManual(service.id)}
                  className="btn-secondary"
                  disabled={loading}
                >
                  תשלום ידני
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
                  title={!service.paypalPlanId ? 'PayPal לא מוגדר לשירות זה' : ''}
                >
                  {loading ? 'מעבד...' : 'הירשם ב-PayPal'}
                </button>
                <button
                  onClick={() => onSubscribeManual(service.id)}
                  className="btn-secondary"
                  disabled={loading}
                >
                  תשלום ידני
                </button>
              </div>
            ) : (
              <div className="info-message">
                שירות זה יהיה זמין בקרוב
              </div>
            )}
          </>
        )}
      </div>

      {subscription?.paypalSubscriptionId && (
        <div className="subscription-id">
          מזהה מנוי: {subscription.paypalSubscriptionId}
        </div>
      )}
    </div>
  );
}
