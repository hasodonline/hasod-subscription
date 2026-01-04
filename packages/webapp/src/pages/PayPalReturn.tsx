import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

type Props = {
  uid: string;
};

export default function PayPalReturn({ uid }: Props) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('מעבד את המנוי שלך...');

  useEffect(() => {
    const subscriptionId = searchParams.get('subscription_id');
    const token = searchParams.get('token');

    if (!subscriptionId && !token) {
      setStatus('error');
      setMessage('חזרה לא תקינה מ-PayPal. חסרים פרטי מנוי.');
      return;
    }

    async function activateSubscription() {
      try {
        const functionUrl = import.meta.env.VITE_FUNCTIONS_URL || 'http://localhost:5001/hasod-subscription/us-central1/api';
        const res = await axios.post(`${functionUrl}/activate-subscription`, {
          uid,
          subscriptionId: subscriptionId || token
        });

        if (res.data.success) {
          setStatus('success');
          setMessage('המנוי שלך הופעל בהצלחה!');
          setTimeout(() => navigate('/subscriptions'), 3000);
        } else {
          setStatus('error');
          setMessage('נכשל בהפעלת המנוי: ' + (res.data.error || 'שגיאה לא ידועה'));
        }
      } catch (e: any) {
        console.error('Error activating subscription:', e);
        setStatus('error');
        setMessage('שגיאה בהפעלת המנוי: ' + (e.response?.data?.error || e.message || 'שגיאה לא ידועה'));
      }
    }

    activateSubscription();
  }, [searchParams, uid, navigate]);

  return (
    <div className="paypal-return-page">
      <h2>אישור מנוי</h2>

      {status === 'processing' && (
        <div className="alert alert-info">
          <p>{message}</p>
          <div className="spinner"></div>
        </div>
      )}

      {status === 'success' && (
        <div className="alert alert-success">
          <p>{message}</p>
          <p>מעביר אותך לעמוד המנויים...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-danger">
          <p>{message}</p>
          <button onClick={() => navigate('/subscriptions')}>
            חזור למנויים
          </button>
        </div>
      )}
    </div>
  );
}
