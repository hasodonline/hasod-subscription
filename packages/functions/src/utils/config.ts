/**
 * Configuration Utilities
 * Centralized configuration management
 * Uses .env file for configuration (migrated from functions.config())
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  baseUrl: string;
}

export interface AppConfig {
  url: string;
}

export interface GoogleConfig {
  serviceAccountKey: any;
  adminEmail: string;
}

export interface SpotifyConfig {
  client_id: string;
  client_secret: string;
}

export interface OpenAIConfig {
  api_key: string;
}

export interface StorageConfig {
  bucket: string;
}

export interface DownloadConfig {
  max_concurrent: number;
  timeout_minutes: number;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  portMin?: number; // Min port for random selection
  portMax?: number; // Max port for random selection
  username?: string;
  password?: string;
  url?: string; // Full proxy URL (http://username:password@host:port)
}

export interface Config {
  paypal: PayPalConfig;
  app: AppConfig;
  google: GoogleConfig;
  spotify?: SpotifyConfig;
  openai?: OpenAIConfig;
  storage?: StorageConfig;
  download?: DownloadConfig;
  proxy?: ProxyConfig;
}

/**
 * Retrieves PayPal configuration from environment variables
 */
export function getPayPalConfig(): PayPalConfig {
  const sandbox = process.env.PAYPAL_SANDBOX === 'true';

  return {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    sandbox,
    baseUrl: sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  };
}

/**
 * Retrieves application configuration
 */
export function getAppConfig(): AppConfig {
  return {
    url: process.env.APP_URL || 'http://localhost:5000'
  };
}

/**
 * Retrieves Google Workspace configuration
 */
export function getGoogleConfig(): GoogleConfig {
  let serviceAccountKey;

  // Parse service account key from environment variable
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (error) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', error);
    }
  }

  return {
    serviceAccountKey,
    adminEmail: process.env.GOOGLE_ADMIN_EMAIL || 'hasod@hasodonline.com'
  };
}

/**
 * Retrieves Spotify API configuration
 */
export function getSpotifyConfig(): SpotifyConfig {
  return {
    client_id: process.env.SPOTIFY_CLIENT_ID || '',
    client_secret: process.env.SPOTIFY_CLIENT_SECRET || ''
  };
}

/**
 * Retrieves OpenAI API configuration
 */
export function getOpenAIConfig(): OpenAIConfig {
  return {
    api_key: process.env.OPENAI_API_KEY || ''
  };
}

/**
 * Retrieves Cloud Storage configuration
 */
export function getStorageConfig(): StorageConfig {
  return {
    bucket: process.env.STORAGE_BUCKET || 'hasod-downloads-temp'
  };
}

/**
 * Retrieves Download service configuration
 */
export function getDownloadConfig(): DownloadConfig {
  return {
    max_concurrent: parseInt(process.env.DOWNLOAD_MAX_CONCURRENT || '3'),
    timeout_minutes: parseInt(process.env.DOWNLOAD_TIMEOUT_MINUTES || '15')
  };
}

/**
 * Retrieves Proxy configuration
 */
export function getProxyConfig(): ProxyConfig {
  const enabled = process.env.PROXY_ENABLED === 'true';
  const host = process.env.PROXY_HOST || 'gate.decodo.com';
  const port = parseInt(process.env.PROXY_PORT || '10001');
  const portMin = parseInt(process.env.PROXY_PORT_MIN || '10001');
  const portMax = parseInt(process.env.PROXY_PORT_MAX || '10040');
  const username = process.env.PROXY_USERNAME || '';
  const password = process.env.PROXY_PASSWORD || '';

  // Build full proxy URL (with default port, will be overridden when needed)
  let url = '';
  if (enabled) {
    if (username && password) {
      url = `http://${username}:${password}@${host}:${port}`;
    } else {
      url = `http://${host}:${port}`;
    }
  }

  return {
    enabled,
    host,
    port,
    portMin,
    portMax,
    username,
    password,
    url
  };
}

/**
 * Get a random port within the configured range
 */
export function getRandomProxyPort(): number {
  const config = getProxyConfig();
  const min = config.portMin || 10001;
  const max = config.portMax || 10040;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Build proxy URL with specific port
 */
export function buildProxyUrl(port?: number): string {
  const config = getProxyConfig();
  if (!config.enabled) {
    return '';
  }

  const selectedPort = port || getRandomProxyPort();

  if (config.username && config.password) {
    return `http://${config.username}:${config.password}@${config.host}:${selectedPort}`;
  } else {
    return `http://${config.host}:${selectedPort}`;
  }
}

/**
 * Retrieves all configuration
 */
export function getConfig(): Config {
  return {
    paypal: getPayPalConfig(),
    app: getAppConfig(),
    google: getGoogleConfig(),
    spotify: getSpotifyConfig(),
    openai: getOpenAIConfig(),
    storage: getStorageConfig(),
    download: getDownloadConfig(),
    proxy: getProxyConfig()
  };
}

/**
 * Validates PayPal configuration
 */
export function validatePayPalConfig(config: PayPalConfig): void {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('PayPal configuration missing. Set paypal.client_id and paypal.client_secret');
  }
}
