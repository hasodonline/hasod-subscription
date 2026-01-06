import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types/user';

type Props = {
  uid: string;
  email: string;
  onComplete: (profile: UserProfile) => void;
};

export default function OnboardingModal({ uid, email, onComplete }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      alert('נא למלא שם ומספר טלפון');
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, 'users', uid);
      const profileData = {
        uid,
        email,
        name: name.trim(),
        phone: phone.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(ref, profileData, { merge: true });
      onComplete(profileData as UserProfile);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל. אנא נסה שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay onboarding-modal">
      <div className="modal-content">
        <div className="onboarding-welcome">
          <h2>ברוכים הבאים להסוד אונליין!</h2>
          <p>כדי להמשיך, אנא מלא את הפרטים הבאים</p>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">שם מלא *</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הכנס את שמך המלא"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">טלפון *</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="הכנס מספר טלפון"
              required
            />
          </div>

          <button type="submit" disabled={saving}>
            {saving ? 'שומר...' : 'המשך'}
          </button>
        </form>
      </div>
    </div>
  );
}
