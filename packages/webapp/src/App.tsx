import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { auth, onAuthStateChanged, signInWithGoogle, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import Subscriptions from './pages/Subscriptions';
import Admin from './pages/Admin';
import Developer from './pages/Developer';
import PayPalReturn from './pages/PayPalReturn';
import Download from './pages/Download';
import OnboardingModal from './components/OnboardingModal';
import ProfileEditModal from './components/ProfileEditModal';
import UserMenu from './components/UserMenu';
import LanguageSwitcher from './components/LanguageSwitcher';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { UserProfile, isProfileComplete } from './types/user';
import './styles.css';

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

const ADMIN_EMAILS = ['hasod@hasodonline.com', 'yubarkan@gmail.com'];

function AppContent() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const { t, isRTL } = useLanguage();

  useEffect(() => {
    console.log('🚀 App component mounted, setting up auth...');

    const unsub = onAuthStateChanged(auth, async (u) => {
      console.log('🔄 Auth state changed:', u ? `User: ${u.email}` : 'No user (logged out)');
      try {
        if (u) {
          console.log('✅ User is logged in:', u.email);
          setUser({ uid: u.uid, email: u.email, displayName: u.displayName });
          // Load user profile from Firestore
          try {
            const profileRef = doc(db, 'users', u.uid);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              console.log('📄 User profile loaded from Firestore');
              setUserProfile({ uid: u.uid, email: u.email || '', ...profileSnap.data() } as UserProfile);
            } else {
              console.log('📝 No profile found, creating basic profile');
              setUserProfile({ uid: u.uid, email: u.email || '' });
            }
          } catch (firestoreError) {
            console.error('❌ Firestore error:', firestoreError);
            // Still set basic profile even if Firestore fails
            setUserProfile({ uid: u.uid, email: u.email || '' });
          }
        } else {
          console.log('👤 No user logged in');
          setUser(null);
          setUserProfile(null);
        }
      } catch (error) {
        console.error('❌ Auth state change error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);
  const profileComplete = isProfileComplete(userProfile);

  async function handleSignIn() {
    try {
      await signInWithGoogle();
      // Success is handled by onAuthStateChanged
    } catch (error: any) {
      console.error('Sign-in failed:', error);
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        alert('שגיאה בהתחברות: ' + error.message);
      }
    }
  }

  // Show loading state
  if (loading) {
    return <div className="app loading">{t.common.loading}</div>;
  }

  // Show onboarding modal for logged in users without complete profile
  const showOnboarding = user && !profileComplete;

  // Render login prompt for non-authenticated users
  const renderLoginPrompt = () => (
    <div className="login-prompt">
      <h2>{t.auth.welcome}</h2>
      <p>{t.auth.loginPrompt}</p>
      <button onClick={handleSignIn}>{t.header.signIn}</button>
    </div>
  );

  return (
    <div className={`app ${isRTL ? 'rtl' : 'ltr'}`}>
      <header>
        <h1>{t.header.title}</h1>
        <nav>
          {user && profileComplete && <Link to="/">{t.nav.subscription}</Link>}
          <Link to="/download">{t.nav.downloads}</Link>
          {isAdmin && <Link to="/admin">{t.nav.admin}</Link>}
          {isAdmin && <Link to="/developer">{t.nav.developer}</Link>}
        </nav>
        <div className="header-actions">
          <LanguageSwitcher />
          {user ? (
            <UserMenu
              user={user}
              profile={userProfile}
              onEditProfile={() => setShowProfileEditModal(true)}
            />
          ) : (
            <button onClick={handleSignIn}>{t.header.signIn}</button>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route
            path="/"
            element={user && profileComplete ? <Subscriptions uid={user.uid} profile={userProfile} /> : renderLoginPrompt()}
          />
          <Route
            path="/subscriptions"
            element={<Navigate to="/" replace />}
          />
          <Route
            path="/paypal-return"
            element={user ? <PayPalReturn uid={user.uid} /> : <Navigate to="/" />}
          />
          <Route
            path="/admin"
            element={isAdmin ? <Admin /> : <Navigate to="/" />}
          />
          <Route
            path="/developer"
            element={isAdmin ? <Developer /> : <Navigate to="/" />}
          />
          <Route
            path="/download"
            element={<Download />}
          />
        </Routes>
      </main>

      {/* Onboarding modal for new users */}
      {showOnboarding && (
        <OnboardingModal
          uid={user.uid}
          email={user.email || ''}
          onComplete={setUserProfile}
        />
      )}

      {/* Profile edit modal */}
      {showProfileEditModal && userProfile && (
        <ProfileEditModal
          profile={userProfile}
          onSave={(updatedProfile) => {
            setUserProfile(updatedProfile);
            setShowProfileEditModal(false);
          }}
          onClose={() => setShowProfileEditModal(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
