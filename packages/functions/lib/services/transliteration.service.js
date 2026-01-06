"use strict";
/**
 * Transliteration Service
 * Uses OpenAI's cheapest model (gpt-4o-mini) to transliterate Hebrew media names to English
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transliterateMedia = transliterateMedia;
const params_1 = require("firebase-functions/params");
const openaiApiKey = (0, params_1.defineString)('OPENAI_API_KEY');
/**
 * Transliterates an array of media items from Hebrew to English
 * Uses OpenAI gpt-4o-mini for cost efficiency
 */
async function transliterateMedia(items) {
    if (!items || items.length === 0) {
        return { success: true, items: [] };
    }
    if (items.length > 50) {
        throw new Error('Maximum 50 items allowed per request');
    }
    const apiKey = openaiApiKey.value();
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    // Build the prompt
    const prompt = buildTransliterationPrompt(items);
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // Cheapest model with good quality
                messages: [
                    {
                        role: 'system',
                        content: `You are a Hebrew to English transliteration expert.
Your task is to transliterate Hebrew song titles, artist names, and album names to English.
Rules:
- Transliterate phonetically (how it sounds), not translate meaning
- Keep English words/names as-is
- Preserve numbers and special characters
- Return ONLY valid JSON, no markdown or explanation
- If a field is empty or null, keep it as empty string in output`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1, // Low temperature for consistent results
                max_tokens: 4000,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        const tokensUsed = data.usage?.total_tokens;
        if (!content) {
            throw new Error('No response from OpenAI');
        }
        // Parse the JSON response
        const transliterated = parseTransliterationResponse(content, items);
        return {
            success: true,
            items: transliterated,
            tokensUsed,
        };
    }
    catch (error) {
        console.error('Transliteration error:', error);
        throw error;
    }
}
/**
 * Builds the prompt for OpenAI
 */
function buildTransliterationPrompt(items) {
    const itemsJson = items.map((item, index) => ({
        index,
        title: item.title || '',
        artist: item.artist || '',
        album: item.album || '',
    }));
    return `Transliterate these Hebrew media items to English. Return a JSON array with the same structure.

Input:
${JSON.stringify(itemsJson, null, 2)}

Return format (JSON array only, no markdown):
[
  { "index": 0, "title": "transliterated title", "artist": "transliterated artist", "album": "transliterated album" },
  ...
]`;
}
/**
 * Parses OpenAI's response and maps it back to the original items
 */
function parseTransliterationResponse(content, originalItems) {
    // Clean up the response - remove markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
    }
    if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
    }
    cleanContent = cleanContent.trim();
    try {
        const parsed = JSON.parse(cleanContent);
        if (!Array.isArray(parsed)) {
            throw new Error('Response is not an array');
        }
        return originalItems.map((original, index) => {
            const transliterated = parsed.find((p) => p.index === index) || parsed[index] || {};
            return {
                original,
                transliterated: {
                    title: transliterated.title || original.title || '',
                    artist: transliterated.artist || original.artist || '',
                    album: transliterated.album || original.album || '',
                },
            };
        });
    }
    catch (parseError) {
        console.error('Failed to parse OpenAI response:', content);
        // Return original items unchanged on parse error
        return originalItems.map(original => ({
            original,
            transliterated: {
                title: original.title || '',
                artist: original.artist || '',
                album: original.album || '',
            },
        }));
    }
}
