import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types/user';

type Props = {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
};

export default function ProfileEditModal({ profile, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile.name || '');
    setPhone(profile.phone || '');
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      alert('נא למלא שם ומספר טלפון');
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, 'users', profile.uid);
      const updatedData = {
        name: name.trim(),
        phone: phone.trim(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(ref, updatedData, { merge: true });
      onSave({ ...profile, ...updatedData });
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל. אנא נסה שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay onboarding-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>עריכת פרופיל</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-name">שם מלא *</label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הכנס את שמך המלא"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-phone">טלפון *</label>
            <input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="הכנס מספר טלפון"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              ביטול
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
