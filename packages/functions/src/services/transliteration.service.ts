/**
 * Transliteration Service
 * Transliterates Hebrew text to English using OpenAI API
 */

import { getConfig } from '../utils/config';
import * as path from 'path';

export class TransliterationService {
  private apiKey: string | null = null;

  constructor() {
    this.loadApiKey();
  }

  /**
   * Load OpenAI API key from Firebase config
   */
  private loadApiKey(): void {
    const config = getConfig();
    this.apiKey = config.openai?.api_key || null;

    if (!this.apiKey) {
      console.warn('[Transliteration] OpenAI API key not configured - transliteration disabled');
    } else {
      console.log('[Transliteration] OpenAI API key loaded');
    }
  }

  /**
   * Check if text contains Hebrew characters
   */
  public hasHebrew(text: string): boolean {
    // Hebrew Unicode range: \u0590-\u05FF
    return /[\u0590-\u05FF]/.test(text);
  }

  /**
   * Transliterate Hebrew text to English
   */
  public async transliterate(text: string): Promise<string> {
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

      const data: any = await response.json();

      if (data.choices && data.choices.length > 0) {
        const transliterated = data.choices[0].message.content.trim();
        console.log(`[Transliteration] Success: '${text}' -> '${transliterated}'`);
        return transliterated;
      } else {
        console.error(`[Transliteration] Unexpected API response:`, data);
        return text;
      }
    } catch (error) {
      console.error(`[Transliteration] Error:`, error);
      return text; // Return original on error
    }
  }

  /**
   * Transliterate a filename, preserving the extension
   */
  public async transliterateFilename(filename: string): Promise<string> {
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
  public sanitizeFilename(filename: string): string {
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
  public async processFilename(filename: string, transliterate: boolean): Promise<string> {
    let processed = this.sanitizeFilename(filename);

    if (transliterate && this.hasHebrew(processed)) {
      processed = await this.transliterateFilename(processed);
      // Sanitize again after transliteration
      processed = this.sanitizeFilename(processed);
    }

    return processed;
  }
}

// Singleton instance
let transliterationService: TransliterationService | null = null;

/**
 * Get the singleton transliteration service instance
 */
export function getTransliterationService(): TransliterationService {
  if (!transliterationService) {
    transliterationService = new TransliterationService();
  }
  return transliterationService;
}
