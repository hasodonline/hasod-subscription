import { useState, useRef, useEffect } from 'react';
import { signOut } from '../firebase';
import { UserProfile } from '../types/user';

type Props = {
  user: { email?: string | null; displayName?: string | null };
  profile: UserProfile | null;
  onEditProfile: () => void;
};

export default function UserMenu({ user, profile, onEditProfile }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get initials for avatar
  const getInitials = () => {
    if (profile?.name) {
      const names = profile.name.trim().split(' ');
      if (names.length >= 2) {
        return names[0][0] + names[names.length - 1][0];
      }
      return names[0][0];
    }
    if (user.displayName) {
      const names = user.displayName.trim().split(' ');
      if (names.length >= 2) {
        return names[0][0] + names[names.length - 1][0];
      }
      return names[0][0];
    }
    if (user.email) {
      return user.email[0];
    }
    return '?';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleEditProfile = () => {
    setIsOpen(false);
    onEditProfile();
  };

  const handleSignOut = () => {
    setIsOpen(false);
    signOut();
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <div
        className="user-avatar"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}
      >
        {getInitials()}
      </div>

      {isOpen && (
        <div className="user-dropdown">
          <div className="user-dropdown-info">
            {profile?.name && <div className="user-dropdown-name">{profile.name}</div>}
            <div className="user-dropdown-email">{user.email}</div>
          </div>

          <div className="user-dropdown-actions">
            <button className="user-dropdown-item" onClick={handleEditProfile}>
              עריכת פרופיל
            </button>
            <button className="user-dropdown-item danger" onClick={handleSignOut}>
              התנתק
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
