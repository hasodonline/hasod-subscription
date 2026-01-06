export type Language = 'he' | 'en';

export const translations = {
  he: {
    // Header
    nav: {
      subscription: 'מנוי',
      downloads: 'הורדות',
      admin: 'ניהול',
      developer: 'מפתח',
    },
    header: {
      title: 'הסוד אונליין',
      signIn: 'התחבר עם Google',
      signOut: 'התנתק',
      editProfile: 'ערוך פרופיל',
    },
    // Auth
    auth: {
      welcome: 'ברוכים הבאים להסוד אונליין',
      loginPrompt: 'התחבר כדי לצפות במנויים שלך',
      loading: 'טוען...',
      signInError: 'שגיאה בהתחברות',
    },
    // Download page
    download: {
      title: 'הורדות Hasod',
      version: 'גרסה',
      released: 'תאריך שחרור',
      downloadBtn: 'הורדה',
      requirements: 'דרישות',
      requirementsList: {
        subscription: 'מנוי Hasod Downloader פעיל',
        os: 'macOS 10.15+ או Windows 10+',
      },
      viewReleases: 'צפה בכל הגרסאות ב-GitHub',
      macFix: {
        title: 'macOS - האפליקציה לא נפתחת?',
        subtitle: 'אם מופיעה שגיאת "app is damaged" או "unidentified developer" - בחר אחת מהאפשרויות:',
        option1: {
          title: 'אפשרות 1: הגדרות מערכת (הכי קל)',
          steps: [
            'נסה לפתוח את האפליקציה - תראה שגיאה, לחץ Done',
            'לחץ על תפריט Apple  → System Settings',
            'לחץ על Privacy & Security בסרגל הצד',
            'גלול למטה עד שתראה "Hasod Downloads was blocked"',
            'לחץ על Open Anyway',
            'הזן את סיסמת ה-Mac שלך אם תתבקש',
            'לחץ על Open לאישור',
          ],
        },
        option2: {
          title: 'אפשרות 2: פקודת Terminal (מהיר יותר)',
          steps: [
            'לחץ Cmd + Space והקלד Terminal, לחץ Enter',
            'לחץ על התיבה הירוקה למטה כדי להעתיק את הפקודה:',
          ],
          step3: 'ב-Terminal, לחץ Cmd + V להדבקה, ואז לחץ Enter',
          step4: 'סגור את Terminal ופתח את האפליקציה - היא תעבוד עכשיו!',
          clickToCopy: 'לחץ להעתקה',
        },
      },
    },
    // Subscriptions page
    subscriptions: {
      title: 'המנויים שלי',
      noSubscriptions: 'אין לך מנויים פעילים',
      status: {
        active: 'פעיל',
        pending: 'ממתין',
        canceled: 'בוטל',
        expired: 'פג תוקף',
      },
      subscribe: 'הרשמה',
      manage: 'ניהול',
      cancel: 'ביטול',
    },
    // Common
    common: {
      loading: 'טוען...',
      error: 'שגיאה',
      save: 'שמור',
      cancel: 'ביטול',
      close: 'סגור',
      confirm: 'אישור',
    },
  },
  en: {
    // Header
    nav: {
      subscription: 'Subscription',
      downloads: 'Downloads',
      admin: 'Admin',
      developer: 'Developer',
    },
    header: {
      title: 'Hasod Online',
      signIn: 'Sign in with Google',
      signOut: 'Sign out',
      editProfile: 'Edit Profile',
    },
    // Auth
    auth: {
      welcome: 'Welcome to Hasod Online',
      loginPrompt: 'Sign in to view your subscriptions',
      loading: 'Loading...',
      signInError: 'Sign in error',
    },
    // Download page
    download: {
      title: 'Hasod Downloads',
      version: 'Version',
      released: 'Released',
      downloadBtn: 'Download',
      requirements: 'Requirements',
      requirementsList: {
        subscription: 'Active Hasod Downloader subscription',
        os: 'macOS 10.15+ or Windows 10+',
      },
      viewReleases: 'View all releases on GitHub',
      macFix: {
        title: "macOS - App Won't Open?",
        subtitle: 'If you see "app is damaged" or "unidentified developer" - choose one of these fixes:',
        option1: {
          title: 'Option 1: System Settings (Easiest)',
          steps: [
            "Try to open the app - you'll see an error, click Done",
            'Click Apple menu  → System Settings',
            'Click Privacy & Security in the sidebar',
            'Scroll down until you see "Hasod Downloads was blocked"',
            'Click Open Anyway',
            'Enter your Mac password if asked',
            'Click Open to confirm',
          ],
        },
        option2: {
          title: 'Option 2: Terminal Command (Faster)',
          steps: [
            'Press Cmd + Space and type Terminal, press Enter',
            'Click the green box below to copy the command:',
          ],
          step3: 'In Terminal, press Cmd + V to paste, then press Enter',
          step4: 'Close Terminal and open the app - it will work now!',
          clickToCopy: 'Click to copy',
        },
      },
    },
    // Subscriptions page
    subscriptions: {
      title: 'My Subscriptions',
      noSubscriptions: 'You have no active subscriptions',
      status: {
        active: 'Active',
        pending: 'Pending',
        canceled: 'Canceled',
        expired: 'Expired',
      },
      subscribe: 'Subscribe',
      manage: 'Manage',
      cancel: 'Cancel',
    },
    // Common
    common: {
      loading: 'Loading...',
      error: 'Error',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      confirm: 'Confirm',
    },
  },
} as const;

export type TranslationKey = typeof translations.en;
