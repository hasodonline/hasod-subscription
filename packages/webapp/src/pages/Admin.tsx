/**
 * Admin Page
 * Multi-service admin dashboard with manual payment processing
 */

import { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types/user';
import { useServices } from '../hooks/useServices';
import ManualPaymentModal from '../components/ManualPaymentModal';
import { cancelSubscription, manageGoogleGroup } from '../api/subscriptions.api';

type UserRow = UserProfile & { id: string };

export default function Admin() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showManualPayment, setShowManualPayment] = useState(false);

  const { services } = useServices(false);

  // Get current user from auth (you'd need to pass this as prop or use context)
  const currentUser = {
    uid: 'admin-uid', // TODO: Get from auth context
    email: 'hasod@hasodonline.com' // TODO: Get from auth context
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm]);

  async function loadUsers() {
    setLoading(true);
    try {
      const snaps = await getDocs(collection(db, 'users'));
      const rows: UserRow[] = [];
      snaps.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setUsers(rows);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('נכשל בטעינת משתמשים');
    } finally {
      setLoading(false);
    }
  }

  function filterUsers() {
    let filtered = users;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.phone?.includes(term) ||
        user.paypalSubscriptionId?.includes(term)
      );
    }

    setFilteredUsers(filtered);
  }

  async function handleDeleteUser(userId: string, userEmail: string) {
    if (!confirm(`למחוק משתמש ${userEmail}? זה יסיר גם את כל המנויים שלו.`)) return;

    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(prev => prev.filter(u => u.id !== userId));
      alert('משתמש נמחק בהצלחה');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('נכשל במחיקת משתמש');
    }
  }

  async function handleCancelSubscription(userId: string, serviceId: string, userEmail: string, serviceName: string) {
    if (!confirm(`לבטל מנוי ${serviceName} עבור ${userEmail}?`)) return;

    try {
      await cancelSubscription(userId, serviceId, 'Canceled by admin');
      alert('מנוי בוטל בהצלחה');
      await loadUsers();
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      alert('נכשל בביטול המנוי: ' + (error.response?.data?.error || error.message));
    }
  }

  async function handleManageGroup(userId: string, serviceId: string, action: 'add' | 'remove', userEmail: string) {
    const actionText = action === 'add' ? 'להוסיף ל' : 'להסיר מ';
    if (!confirm(`${actionText}קבוצת גוגל: ${userEmail}?`)) return;

    try {
      await manageGoogleGroup(userId, serviceId, action);
      alert(`משתמש ${action === 'add' ? 'נוסף לקבוצה' : 'הוסר מהקבוצה'} בהצלחה`);
      await loadUsers();
    } catch (error: any) {
      console.error('Error managing group:', error);
      alert(`נכשל ב${action === 'add' ? 'הוספה' : 'הסרה'}: ` + (error.response?.data?.error || error.message));
    }
  }

  function getServiceStatus(user: UserRow, serviceId: string) {
    const service = user.services?.[serviceId];
    if (!service) return '✗';

    const statusIcons: Record<string, string> = {
      active: '✓',
      pending: '⏳',
      canceled: '✗',
      expired: '✗',
      suspended: '⏸️',
      none: '✗'
    };

    const paymentIcons: Record<string, string> = {
      paypal: '💳',
      manual: '💰'
    };

    const statusIcon = statusIcons[service.status] || '✗';
    const paymentIcon = service.paymentMethod ? paymentIcons[service.paymentMethod] : '';

    return (
      <span title={`${service.status} - ${service.paymentMethod || 'unknown'}`}>
        {statusIcon} {paymentIcon}
      </span>
    );
  }

  if (loading) return <div className="admin-page">טוען...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>לוח בקרה ניהולי</h2>
        <div className="admin-actions">
          <button onClick={() => setShowManualPayment(true)} className="btn-primary">
            ➕ תשלום ידני
          </button>
          <button onClick={loadUsers} className="btn-secondary">
            🔄 רענן
          </button>
        </div>
      </div>

      <div className="stats-summary">
        <div className="stat-item">
          <span>סה"כ משתמשים:</span>
          <strong>{users.length}</strong>
        </div>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="חיפוש לפי שם, אימייל, טלפון או מזהה מנוי..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>אימייל</th>
              <th>טלפון</th>
              {services.map(service => (
                <th key={service.id} title={service.nameHe}>
                  {service.nameHe}
                </th>
              ))}
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4 + services.length} style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  לא נמצאו משתמשים
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.name || '-'}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.phone || '-'}</td>

                  {services.map(service => (
                    <td key={service.id} style={{ textAlign: 'center', fontSize: '1.2rem' }}>
                      {getServiceStatus(user, service.id)}
                    </td>
                  ))}

                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {services.map(service => {
                        const userService = user.services?.[service.id];
                        if (!userService || userService.status !== 'active') return null;

                        return (
                          <button
                            key={`cancel-${service.id}`}
                            onClick={() => handleCancelSubscription(user.id, service.id, user.email, service.nameHe)}
                            className="btn-danger"
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            title={`ביטול ${service.nameHe}`}
                          >
                            ביטול {service.nameHe}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        style={{ padding: '4px 8px', fontSize: '0.85rem', background: '#666', color: 'white' }}
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '20px', color: '#9ca3af', fontSize: '0.95rem' }}>
        מציג {filteredUsers.length} מתוך {users.length} משתמשים
      </p>

      {showManualPayment && (
        <ManualPaymentModal
          services={services}
          currentUserUid={currentUser.uid}
          currentUserEmail={currentUser.email}
          onClose={() => setShowManualPayment(false)}
          onSuccess={() => {
            loadUsers();
            setShowManualPayment(false);
          }}
        />
      )}
    </div>
  );
}
