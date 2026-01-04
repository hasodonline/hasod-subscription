/**
 * Developer Page
 * Service management interface for admins
 */

import { useState } from 'react';
import { useServices } from '../hooks/useServices';
import { Service } from '../types/service';
import { createOrUpdateService, deleteService } from '../api/services.api';

export default function Developer() {
  const { services, loading, reload } = useServices(false);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [saving, setSaving] = useState(false);

  function handleNew() {
    setEditing({
      id: '',
      name: '',
      nameHe: '',
      description: '',
      descriptionHe: '',
      paypalPlanId: '',
      pricePerMonth: 10,
      currency: 'USD',
      googleGroupEmail: '',
      active: true,
      order: services.length + 1,
      features: [],
      featuresHe: [],
      createdBy: 'admin'
    });
  }

  function handleEdit(service: Service) {
    setEditing({ ...service });
  }

  async function handleSave() {
    if (!editing) return;

    if (!editing.name || !editing.nameHe || !editing.description || !editing.descriptionHe) {
      alert('נא למלא את כל השדות הנדרשים');
      return;
    }

    setSaving(true);

    try {
      await createOrUpdateService(editing);
      alert(editing.id ? 'שירות עודכן בהצלחה' : 'שירות נוצר בהצלחה');
      setEditing(null);
      await reload();
    } catch (error: any) {
      console.error('Error saving service:', error);
      alert('שגיאה בשמירת שירות: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(serviceId: string, serviceName: string) {
    if (!confirm(`למחוק את השירות "${serviceName}"?\n\nזה עלול להשפיע על משתמשים קיימים!`)) return;

    try {
      await deleteService(serviceId);
      alert('שירות נמחק בהצלחה');
      await reload();
    } catch (error: any) {
      console.error('Error deleting service:', error);
      alert('שגיאה במחיקת שירות: ' + (error.response?.data?.error || error.message));
    }
  }

  if (loading) return <div className="developer-page">טוען...</div>;

  return (
    <div className="developer-page">
      <div className="page-header">
        <h2>ניהול שירותים - מפתח</h2>
        <button onClick={handleNew} className="btn-primary">
          ➕ שירות חדש
        </button>
      </div>

      <div className="services-list">
        {services.length === 0 ? (
          <div className="no-services">
            <p>אין שירותים. לחץ "שירות חדש" כדי להוסיף.</p>
          </div>
        ) : (
          services.map(service => (
            <div key={service.id} className="service-item">
              <div className="service-info">
                <h3>{service.nameHe}</h3>
                <p className="service-id">מזהה: {service.id}</p>
                <p>מחיר: ${service.pricePerMonth}/{service.currency === 'ILS' ? '₪' : '$'} לחודש</p>
                <p>PayPal Plan ID: {service.paypalPlanId || '(לא מוגדר)'}</p>
                <p>קבוצת Google: {service.googleGroupEmail || '(אין)'}</p>
                <p className={service.active ? 'text-success' : 'text-danger'}>
                  סטטוס: {service.active ? 'פעיל ✓' : 'לא פעיל ✗'}
                </p>
              </div>
              <div className="service-actions">
                <button onClick={() => handleEdit(service)} className="btn-secondary">
                  ✏️ ערוך
                </button>
                <button
                  onClick={() => handleDelete(service.id, service.nameHe)}
                  className="btn-danger"
                >
                  🗑️ מחק
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing.id ? 'ערוך שירות' : 'שירות חדש'}</h2>
              <button className="close-button" onClick={() => setEditing(null)}>×</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="service-form">
              <div className="form-row">
                <div className="form-group">
                  <label>שם (אנגלית) *</label>
                  <input
                    type="text"
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Music Library Access"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>שם (עברית) *</label>
                  <input
                    type="text"
                    value={editing.nameHe || ''}
                    onChange={(e) => setEditing({ ...editing, nameHe: e.target.value })}
                    placeholder="גישה לספריית המוזיקה"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>תיאור (אנגלית) *</label>
                <textarea
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Access to exclusive music..."
                  rows={2}
                  required
                />
              </div>

              <div className="form-group">
                <label>תיאור (עברית) *</label>
                <textarea
                  value={editing.descriptionHe || ''}
                  onChange={(e) => setEditing({ ...editing, descriptionHe: e.target.value })}
                  placeholder="גישה לאוסף מוזיקה בלעדי..."
                  rows={2}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>PayPal Plan ID</label>
                  <input
                    type="text"
                    value={editing.paypalPlanId || ''}
                    onChange={(e) => setEditing({ ...editing, paypalPlanId: e.target.value })}
                    placeholder="P-XXXXXXXXXXXXXXXXX"
                  />
                </div>
                <div className="form-group">
                  <label>מחיר לחודש *</label>
                  <input
                    type="number"
                    value={editing.pricePerMonth || 0}
                    onChange={(e) => setEditing({ ...editing, pricePerMonth: parseFloat(e.target.value) })}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>מטבע</label>
                  <select
                    value={editing.currency || 'USD'}
                    onChange={(e) => setEditing({ ...editing, currency: e.target.value as any })}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="ILS">ILS (₪)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>סדר תצוגה</label>
                  <input
                    type="number"
                    value={editing.order || 1}
                    onChange={(e) => setEditing({ ...editing, order: parseInt(e.target.value) })}
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>אימייל קבוצת Google</label>
                <input
                  type="email"
                  value={editing.googleGroupEmail || ''}
                  onChange={(e) => setEditing({ ...editing, googleGroupEmail: e.target.value })}
                  placeholder="group@hasodonline.com"
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editing.active || false}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  {' '}שירות פעיל (זמין למנוי)
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary" disabled={saving}>
                  ביטול
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
