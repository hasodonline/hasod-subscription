import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, isProfileComplete } from '../types/user';

type Props = {
  uid: string;
  profile: UserProfile | null;
  onUpdate: (profile: UserProfile) => void;
};

export default function Profile({ uid, profile, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  async function save() {
    if (!name.trim() || !phone.trim()) {
      alert('נא למלא שם ומספר טלפון');
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, 'users', uid);
      const updatedData = {
        name: name.trim(),
        phone: phone.trim(),
        email: profile?.email || '',
        updatedAt: new Date().toISOString()
      };
      await setDoc(ref, updatedData, { merge: true });

      // Update local state
      onUpdate({ ...profile!, ...updatedData });
      alert('הפרופיל נשמר בהצלחה!');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('שגיאה בשמירת הפרופיל. אנא נסה שוב.');
    } finally {
      setSaving(false);
    }
  }

  const needsCompletion = !isProfileComplete(profile);

  return (
    <div className="profile-page">
      <h2>פרופיל אישי</h2>
      {needsCompletion && (
        <div className="alert alert-info">
          אנא השלם את הפרופיל שלך כדי לגשת למנוי
        </div>
      )}
      <div className="form-group">
        <label>
          שם מלא *
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="הכנס את שמך המלא"
            required
          />
        </label>
      </div>
      <div className="form-group">
        <label>
          טלפון *
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="הכנס מספר טלפון"
            required
          />
        </label>
      </div>
      <button onClick={save} disabled={saving}>
        {saving ? 'שומר...' : 'שמור פרופיל'}
      </button>
    </div>
  );
}
