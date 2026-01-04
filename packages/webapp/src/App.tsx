import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { auth, onAuthStateChanged, signInWithGoogle, signOut, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Subscriptions from './pages/Subscriptions';
import Download from './pages/Download';
import Admin from './pages/Admin';
import Developer from './pages/Developer';
import PayPalReturn from './pages/PayPalReturn';
import { UserProfile, isProfileComplete } from './types/user';
import './styles.css';

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

const ADMIN_EMAILS = ['hasod@hasodonline.com', 'yubarkan@gmail.com'];

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

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
    return <div className="app loading">טוען...</div>;
  }

  // Onboarding: if user is logged in but profile incomplete, redirect to profile
  // (except when already on profile page)
  const needsOnboarding = user && !profileComplete && location.pathname !== '/profile';

  return (
    <div className="app">
      <header>
        <h1>הסוד אונליין</h1>
        <nav>
          <Link to="/">בית</Link>
          {user && <Link to="/profile">פרופיל</Link>}
          {user && profileComplete && <Link to="/subscriptions">מנוי</Link>}
          {user && profileComplete && <Link to="/download">הורדות</Link>}
          {isAdmin && <Link to="/admin">ניהול</Link>}
          {isAdmin && <Link to="/developer">מפתח</Link>}
        </nav>
        <div>
          {user ? (
            <>
              <span>{user.email}</span>
              <button onClick={() => signOut()}>התנתק</button>
            </>
          ) : (
            <button onClick={handleSignIn}>התחבר עם Google</button>
          )}
        </div>
      </header>

      <main>
        {needsOnboarding ? (
          <Navigate to="/profile" replace />
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/profile"
              element={user ? <Profile uid={user.uid} profile={userProfile} onUpdate={setUserProfile} /> : <Navigate to="/" />}
            />
            <Route
              path="/subscriptions"
              element={user && profileComplete ? <Subscriptions uid={user.uid} profile={userProfile} /> : <Navigate to="/" />}
            />
            <Route
              path="/download"
              element={user && profileComplete ? <Download /> : <Navigate to="/" />}
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
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
