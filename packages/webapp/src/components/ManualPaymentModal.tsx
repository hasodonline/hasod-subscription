/**
 * ManualPaymentModal Component
 * Modal for admins to process manual payments
 */

import { useState } from 'react';
import { Service } from '../types/service';
import { processManualPayment } from '../api/transactions.api';

interface ManualPaymentModalProps {
  services: Service[];
  currentUserUid: string;
  currentUserEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualPaymentModal({
  services,
  currentUserUid,
  currentUserEmail,
  onClose,
  onSuccess
}: ManualPaymentModalProps) {
  const [userEmail, setUserEmail] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [durationMonths, setDurationMonths] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank-transfer' | 'other'>('cash');
  const [notes, setNotes] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!userEmail || !serviceId || !amount || !durationMonths) {
      alert('נא למלא את כל השדות הנדרשים');
      return;
    }

    const amountNum = parseFloat(amount);
    const durationNum = parseInt(durationMonths);

    if (isNaN(amountNum) || amountNum <= 0) {
      alert('סכום לא תקין');
      return;
    }

    if (isNaN(durationNum) || durationNum < 1 || durationNum > 120) {
      alert('משך זמן לא תקין (1-120 חודשים)');
      return;
    }

    if (!window.confirm(`לאשר תשלום ידני?\n\nמשתמש: ${userEmail}\nשירות: ${services.find(s => s.id === serviceId)?.nameHe}\nסכום: ${amountNum}\nמשך: ${durationNum} חודשים`)) {
      return;
    }

    setLoading(true);

    try {
      await processManualPayment({
        userEmail,
        serviceId,
        amount: amountNum,
        durationMonths: durationNum,
        paymentMethod,
        notes,
        receiptNumber,
        processedByUid: currentUserUid,
        processedByEmail: currentUserEmail
      });

      alert('תשלום ידני עובד בהצלחה! המשתמש קיבל גישה לשירות.');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error processing manual payment:', error);
      alert('שגיאה בעיבוד תשלום: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>תשלום ידני</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="manual-payment-form">
          <div className="form-group">
            <label htmlFor="userEmail">אימייל משתמש *</label>
            <input
              type="email"
              id="userEmail"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="serviceId">שירות *</label>
            <select
              id="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              disabled={loading}
            >
              <option value="">בחר שירות...</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {service.nameHe} (${service.pricePerMonth}/חודש)
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="amount">סכום שנגבה *</label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
                min="0"
                step="0.01"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="durationMonths">משך (חודשים) *</label>
              <input
                type="number"
                id="durationMonths"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                placeholder="1"
                min="1"
                max="120"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">אמצעי תשלום *</label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              required
              disabled={loading}
            >
              <option value="cash">מזומן</option>
              <option value="bank-transfer">העברה בנקאית</option>
              <option value="other">אחר</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="receiptNumber">מספר קבלה (אופציונלי)</label>
            <input
              type="text"
              id="receiptNumber"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder="12345"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="notes">הערות (אופציונלי)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערות נוספות..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
              ביטול
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'מעבד...' : 'אשר תשלום'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
