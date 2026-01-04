"use strict";
/**
 * Transliteration Service
 * Transliterates Hebrew text to English using OpenAI API
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransliterationService = void 0;
exports.getTransliterationService = getTransliterationService;
const config_1 = require("../utils/config");
const path = __importStar(require("path"));
class TransliterationService {
    constructor() {
        this.apiKey = null;
        this.loadApiKey();
    }
    /**
     * Load OpenAI API key from Firebase config
     */
    loadApiKey() {
        const config = (0, config_1.getConfig)();
        this.apiKey = config.openai?.api_key || null;
        if (!this.apiKey) {
            console.warn('[Transliteration] OpenAI API key not configured - transliteration disabled');
        }
        else {
            console.log('[Transliteration] OpenAI API key loaded');
        }
    }
    /**
     * Check if text contains Hebrew characters
     */
    hasHebrew(text) {
        // Hebrew Unicode range: \u0590-\u05FF
        return /[\u0590-\u05FF]/.test(text);
    }
    /**
     * Transliterate Hebrew text to English
     */
    async transliterate(text) {
        // Check if we need to transliterate
        if (!this.hasHebrew(text)) {
            console.log(`[Transliteration] No Hebrew characters found in: ${text}`);
            return text;
        }
        if (!this.apiKey) {
            console.warn('[Transliteration] No API key available, returning original text');
            return text;
        }
        try {
            console.log(`[Transliteration] Transliterating: ${text}`);
            // Call OpenAI API
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', // Cheapest model
                    messages: [
                        {
                            role: 'user',
                            content: `Transliterate this text to English (Latin alphabet). Keep non-Hebrew parts unchanged. Only output the transliterated text, nothing else:\n\n${text}`,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 100,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Transliteration] API error: ${response.status} - ${errorText}`);
                return text; // Return original on error
            }
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                const transliterated = data.choices[0].message.content.trim();
                console.log(`[Transliteration] Success: '${text}' -> '${transliterated}'`);
                return transliterated;
            }
            else {
                console.error(`[Transliteration] Unexpected API response:`, data);
                return text;
            }
        }
        catch (error) {
            console.error(`[Transliteration] Error:`, error);
            return text; // Return original on error
        }
    }
    /**
     * Transliterate a filename, preserving the extension
     */
    async transliterateFilename(filename) {
        const ext = path.extname(filename);
        const nameWithoutExt = path.basename(filename, ext);
        // Transliterate the name part only
        const transliteratedName = await this.transliterate(nameWithoutExt);
        // Reconstruct filename
        return transliteratedName + ext;
    }
    /**
     * Sanitize filename by removing invalid characters
     */
    sanitizeFilename(filename) {
        // Remove invalid filename characters
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
        let sanitized = filename.replace(invalidChars, '_');
        // Remove leading/trailing dots and spaces
        sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
        // Limit length to 255 characters (common filesystem limit)
        if (sanitized.length > 255) {
            const ext = path.extname(sanitized);
            const nameWithoutExt = path.basename(sanitized, ext);
            sanitized = nameWithoutExt.substring(0, 255 - ext.length) + ext;
        }
        return sanitized || 'unnamed';
    }
    /**
     * Process a filename: sanitize and optionally transliterate
     */
    async processFilename(filename, transliterate) {
        let processed = this.sanitizeFilename(filename);
        if (transliterate && this.hasHebrew(processed)) {
            processed = await this.transliterateFilename(processed);
            // Sanitize again after transliteration
            processed = this.sanitizeFilename(processed);
        }
        return processed;
    }
}
exports.TransliterationService = TransliterationService;
// Singleton instance
let transliterationService = null;
/**
 * Get the singleton transliteration service instance
 */
function getTransliterationService() {
    if (!transliterationService) {
        transliterationService = new TransliterationService();
    }
    return transliterationService;
}
