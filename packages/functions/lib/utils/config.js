"use strict";
/**
 * Configuration Utilities
 * Centralized configuration management
 * Uses .env file for configuration (migrated from functions.config())
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayPalConfig = getPayPalConfig;
exports.getAppConfig = getAppConfig;
exports.getGoogleConfig = getGoogleConfig;
exports.getSpotifyConfig = getSpotifyConfig;
exports.getOpenAIConfig = getOpenAIConfig;
exports.getStorageConfig = getStorageConfig;
exports.getDownloadConfig = getDownloadConfig;
exports.getProxyConfig = getProxyConfig;
exports.getRandomProxyPort = getRandomProxyPort;
exports.buildProxyUrl = buildProxyUrl;
exports.getConfig = getConfig;
exports.validatePayPalConfig = validatePayPalConfig;
/**
 * Retrieves PayPal configuration from environment variables
 */
function getPayPalConfig() {
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
function getAppConfig() {
    return {
        url: process.env.APP_URL || 'http://localhost:5000'
    };
}
/**
 * Retrieves Google Workspace configuration
 */
function getGoogleConfig() {
    let serviceAccountKey;
    // Parse service account key from environment variable
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        try {
            serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        }
        catch (error) {
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
function getSpotifyConfig() {
    return {
        client_id: process.env.SPOTIFY_CLIENT_ID || '',
        client_secret: process.env.SPOTIFY_CLIENT_SECRET || ''
    };
}
/**
 * Retrieves OpenAI API configuration
 */
function getOpenAIConfig() {
    return {
        api_key: process.env.OPENAI_API_KEY || ''
    };
}
/**
 * Retrieves Cloud Storage configuration
 */
function getStorageConfig() {
    return {
        bucket: process.env.STORAGE_BUCKET || 'hasod-downloads-temp'
    };
}
/**
 * Retrieves Download service configuration
 */
function getDownloadConfig() {
    return {
        max_concurrent: parseInt(process.env.DOWNLOAD_MAX_CONCURRENT || '3'),
        timeout_minutes: parseInt(process.env.DOWNLOAD_TIMEOUT_MINUTES || '15')
    };
}
/**
 * Retrieves Proxy configuration
 */
function getProxyConfig() {
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
        }
        else {
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
function getRandomProxyPort() {
    const config = getProxyConfig();
    const min = config.portMin || 10001;
    const max = config.portMax || 10040;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/**
 * Build proxy URL with specific port
 */
function buildProxyUrl(port) {
    const config = getProxyConfig();
    if (!config.enabled) {
        return '';
    }
    const selectedPort = port || getRandomProxyPort();
    if (config.username && config.password) {
        return `http://${config.username}:${config.password}@${config.host}:${selectedPort}`;
    }
    else {
        return `http://${config.host}:${selectedPort}`;
    }
}
/**
 * Retrieves all configuration
 */
function getConfig() {
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
function validatePayPalConfig(config) {
    if (!config.clientId || !config.clientSecret) {
        throw new Error('PayPal configuration missing. Set paypal.client_id and paypal.client_secret');
    }
}
