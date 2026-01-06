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
      title: 'מנויי הסוד אונליין',
      loadingServices: 'טוען שירותים...',
      noServices: 'אין שירותים זמינים כרגע',
      helpText: 'זקוק לעזרה? צור קשר:',
      status: {
        active: 'פעיל',
        pending: 'ממתין לאישור',
        canceled: 'בוטל',
        expired: 'פג תוקף',
        suspended: 'מושהה',
        none: 'לא פעיל',
      },
      paymentMethod: {
        paypal: 'PayPal',
        manual: 'תשלום ידני',
      },
      perMonth: '/חודש',
      validUntil: 'תוקף עד:',
      hasAccess: 'יש לך גישה לשירות זה',
      manageSubscription: 'נהל מנוי',
      waitingPaypal: 'ממתין לאישור התשלום ב-PayPal',
      subscriptionCanceled: 'המנוי בוטל. הירשם שוב לקבל גישה.',
      subscriptionExpired: 'המנוי פג תוקף. הירשם שוב לקבל גישה.',
      subscribePaypal: 'הירשם ב-PayPal',
      subscribeManual: 'תשלום ידני',
      processing: 'מעבד...',
      comingSoon: 'שירות זה יהיה זמין בקרוב',
      subscriptionId: 'מזהה מנוי:',
      paypalNotConfigured: 'PayPal לא מוגדר לשירות זה',
      manualPaymentContact: `לתשלום ידני, צור קשר:

📞 טלפון: 054-123-4567
📧 אימייל: hasod@hasodonline.com

אפשרויות תשלום:
• מזומן
• העברה בנקאית
• ביט/פייבוקס

לאחר התשלום, המנהל יפעיל את השירות עבורך תוך 24 שעות.`,
      errors: {
        paypalNotAvailable: 'שירות זה אינו זמין כרגע דרך PayPal. אנא השתמש בתשלום ידני.',
        noApprovalUrl: 'לא התקבל קישור לאישור מ-PayPal. אנא נסה שוב.',
        serviceUnavailable: 'שירות המנויים אינו זמין כרגע. אנא נסה שוב מאוחר יותר.',
        createSubscription: 'שגיאה ביצירת מנוי:',
      },
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
      title: 'Hasod Online Subscriptions',
      loadingServices: 'Loading services...',
      noServices: 'No services available at the moment',
      helpText: 'Need help? Contact us:',
      status: {
        active: 'Active',
        pending: 'Pending Approval',
        canceled: 'Canceled',
        expired: 'Expired',
        suspended: 'Suspended',
        none: 'Not Active',
      },
      paymentMethod: {
        paypal: 'PayPal',
        manual: 'Manual Payment',
      },
      perMonth: '/month',
      validUntil: 'Valid until:',
      hasAccess: 'You have access to this service',
      manageSubscription: 'Manage Subscription',
      waitingPaypal: 'Waiting for PayPal payment approval',
      subscriptionCanceled: 'Subscription canceled. Subscribe again to regain access.',
      subscriptionExpired: 'Subscription expired. Subscribe again to regain access.',
      subscribePaypal: 'Subscribe with PayPal',
      subscribeManual: 'Manual Payment',
      processing: 'Processing...',
      comingSoon: 'This service will be available soon',
      subscriptionId: 'Subscription ID:',
      paypalNotConfigured: 'PayPal is not configured for this service',
      manualPaymentContact: `For manual payment, contact us:

📞 Phone: 054-123-4567
📧 Email: hasod@hasodonline.com

Payment options:
• Cash
• Bank transfer
• Bit/PayBox

After payment, an admin will activate your service within 24 hours.`,
      errors: {
        paypalNotAvailable: 'This service is not available via PayPal at the moment. Please use manual payment.',
        noApprovalUrl: 'No approval URL received from PayPal. Please try again.',
        serviceUnavailable: 'Subscription service is currently unavailable. Please try again later.',
        createSubscription: 'Error creating subscription:',
      },
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
