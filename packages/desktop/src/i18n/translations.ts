export type Language = 'he' | 'en';

export const translations = {
  he: {
    // Header
    header: {
      title: 'מוריד הסוד',
      subtitle: 'מוריד מוסיקה מרובה שירותים',
      hideDropZone: 'הסתר אזור שחרור',
      showDropZone: 'שחרור מהיר',
      hideDropZoneTooltip: 'הסתר אזור שחרור מהיר',
      showDropZoneTooltip: 'הצג אזור שחרור מהיר',
    },
    // Tabs
    tabs: {
      downloads: 'הורדות',
      license: 'רישיון',
    },
    // License Tab
    license: {
      title: 'סטטוס רישיון',
      statusActive: 'פעיל',
      statusNotRegistered: 'לא רשום',
      statusExpired: 'פג תוקף',
      statusSuspended: 'מושעה',
      deviceId: 'מזהה מכשיר:',
      email: 'אימייל:',
      expires: 'תפוגה:',
      loginWithGoogle: 'התחבר עם Google',
      subscribeNow: 'הרשם עכשיו',
      refreshStatus: 'רענן סטטוס',
      logout: 'התנתק',
      // How it works
      howItWorks: 'איך זה עובד',
      step1: 'לחץ על "התחבר עם Google" להתחברות מאובטחת',
      step2: 'החשבון שלך יאומת דרך ה-API של הסוד',
      step3: 'אם יש לך מנוי "מוריד הסוד" פעיל - ההורדות מופעלות',
      step4: 'אם לא - לחץ "הרשם עכשיו" לקבלת גישה',
    },
    // Download Tab
    download: {
      title: 'הורד מוסיקה',
      licenseWarning: 'הרישיון לא פעיל. אנא עבור ללשונית רישיון והתחבר.',
      supported: 'נתמכים:',
      urlPlaceholder: 'הדבק URL מכל שירות נתמך...',
      addToQueue: 'הוסף לתור',
      // Queue
      queueTitle: 'תור הורדות',
      downloading: 'מוריד',
      waiting: 'ממתין',
      done: 'הושלם',
      failed: 'נכשל',
      clearCompleted: 'נקה הושלמו',
      // Status
      statusQueued: 'ממתין...',
      statusDownloading: 'מוריד...',
      statusConverting: 'ממיר...',
      statusComplete: 'הושלם',
      statusError: 'נכשל',
      removeFromQueue: 'הסר מהתור',
      // Progress log
      progressLog: 'יומן התקדמות',
      // Features
      featuresTitle: 'תכונות',
      featureQueue: 'מערכת תור:',
      featureQueueDesc: 'הוסף מספר URLs, הם יורדו אחד אחד',
      featureDropZone: 'אזור שחרור מהיר:',
      featureDropZoneDesc: 'גרור URLs מהדפדפן ישירות לכפתור הצף',
      featureOrganize: 'ארגון אוטומטי:',
      featureOrganizeDesc: 'קבצים נשמרים כאמן/אלבום/שיר.mp3',
      featureQuality: 'איכות גבוהה:',
      featureQualityDesc: 'מוריד את האיכות הטובה ביותר הזמינה',
      saveLocation: 'קבצים נשמרים ב: ~/Downloads/Hasod Downloads/',
      englishOnlyMode: 'שמות קבצים באנגלית בלבד',
      englishOnlyHint: '(מתרגם עברית לאנגלית)',
    },
    // Login progress messages
    login: {
      openingGoogle: 'פותח התחברות Google...',
      waitingForLogin: 'ממתין להתחברות בדפדפן...',
      exchangingTokens: 'מחליף טוקנים...',
      checkingLicense: 'בודק רישיון...',
      loginFailed: 'ההתחברות נכשלה:',
    },
    // Footer
    footer: {
      version: 'מוריד הסוד v0.2.0 | תור רב-שירותי',
    },
    // Common
    common: {
      loading: 'טוען...',
      pleaseEnterUrl: 'אנא הזן URL',
      licenseNotValid: 'הרישיון לא תקף. אנא התחבר קודם.',
      failedToAddToQueue: 'נכשל בהוספה לתור:',
    },
    // Floating Button
    floating: {
      dropUrlHere: 'שחרר URL כאן!',
      downloadQueue: 'תור הורדות',
      inQueue: 'בתור',
      dropOrClick: 'שחרר URLs או לחץ להוספה מהלוח',
      clearCompleted: 'נקה הושלמו',
      clearAll: 'נקה הכל',
      confirmClearAll: 'האם אתה בטוח שברצונך לנקות את כל הפריטים מהתור?',
      clickToOpen: 'לחץ לפתיחה ב-Finder',
      play: 'נגן',
      playing: 'מנגן',
      more: 'עוד',
      converting: 'ממיר...',
      done: 'הושלם',
      waiting: 'ממתין...',
      error: 'שגיאה',
    },
  },
  en: {
    // Header
    header: {
      title: 'Hasod Downloads',
      subtitle: 'Multi-Service Music Downloader',
      hideDropZone: 'Hide Drop Zone',
      showDropZone: 'Quick Drop',
      hideDropZoneTooltip: 'Hide Quick Drop Zone',
      showDropZoneTooltip: 'Show Quick Drop Zone',
    },
    // Tabs
    tabs: {
      downloads: 'Downloads',
      license: 'License',
    },
    // License Tab
    license: {
      title: 'License Status',
      statusActive: 'Active',
      statusNotRegistered: 'not registered',
      statusExpired: 'Expired',
      statusSuspended: 'Suspended',
      deviceId: 'Device ID:',
      email: 'Email:',
      expires: 'Expires:',
      loginWithGoogle: 'Login with Google',
      subscribeNow: 'Subscribe Now',
      refreshStatus: 'Refresh Status',
      logout: 'Logout',
      // How it works
      howItWorks: 'How It Works',
      step1: 'Click "Login with Google" to sign in securely',
      step2: 'Your account will be verified via Hasod API',
      step3: 'If you have active "Hasod Downloader" subscription - Downloads enabled',
      step4: 'If not - Click "Subscribe Now" to get access',
    },
    // Download Tab
    download: {
      title: 'Download Music',
      licenseWarning: 'License not active. Please go to License tab and login.',
      supported: 'Supported:',
      urlPlaceholder: 'Paste URL from any supported service...',
      addToQueue: 'Add to Queue',
      // Queue
      queueTitle: 'Download Queue',
      downloading: 'downloading',
      waiting: 'waiting',
      done: 'done',
      failed: 'failed',
      clearCompleted: 'Clear Completed',
      clearAll: 'Clear All',
      confirmClearAll: 'Are you sure you want to clear all items from the queue?',
      clickToOpen: 'Click to open in Finder',
      play: 'Play',
      playing: 'Playing',
      // Status
      statusQueued: 'Waiting...',
      statusDownloading: 'Downloading...',
      statusConverting: 'Converting...',
      statusComplete: 'Done',
      statusError: 'Failed',
      removeFromQueue: 'Remove from queue',
      // Progress log
      progressLog: 'Progress Log',
      // Features
      featuresTitle: 'Features',
      featureQueue: 'Queue System:',
      featureQueueDesc: 'Add multiple URLs, they download one by one',
      featureDropZone: 'Quick Drop Zone:',
      featureDropZoneDesc: 'Drag URLs from browser directly to floating button',
      featureOrganize: 'Auto-Organization:',
      featureOrganizeDesc: 'Files saved as Artist/Album/Song.mp3',
      featureQuality: 'High Quality:',
      featureQualityDesc: 'Downloads best available audio quality',
      saveLocation: 'Files saved to: ~/Downloads/Hasod Downloads/',
      englishOnlyMode: 'English Only Filenames',
      englishOnlyHint: '(Transliterates Hebrew to English)',
    },
    // Login progress messages
    login: {
      openingGoogle: 'Opening Google login...',
      waitingForLogin: 'Waiting for login in browser...',
      exchangingTokens: 'Exchanging tokens...',
      checkingLicense: 'Checking license...',
      loginFailed: 'Login failed:',
    },
    // Footer
    footer: {
      version: 'Hasod Downloads v0.2.0 | Multi-Service Queue',
    },
    // Common
    common: {
      loading: 'Loading...',
      pleaseEnterUrl: 'Please enter a URL',
      licenseNotValid: 'License not valid. Please login first.',
      failedToAddToQueue: 'Failed to add to queue:',
    },
    // Floating Button
    floating: {
      dropUrlHere: 'Drop URL here!',
      downloadQueue: 'Download Queue',
      inQueue: 'in queue',
      dropOrClick: 'Drop URLs or click to add from clipboard',
      clearCompleted: 'Clear completed',
      more: 'more',
      converting: 'Converting...',
      done: 'Done',
      waiting: 'Waiting...',
      error: 'Error',
    },
  },
} as const;

export type TranslationStrings = typeof translations.en;
