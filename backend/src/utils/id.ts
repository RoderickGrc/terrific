/**
 * Generate a short random ID
 * @param length Length of the ID (default 8)
 * @returns A random alphanumeric string
 */
export function generateShortId(length: number = 8): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generate a short event ID with optional prefix
 * @param prefix Optional prefix (e.g. 'evt')
 * @returns A string in format prefix_random
 */
export function generateEventId(prefix: string = 'ev'): string {
    return `${prefix}_${generateShortId(6)}`;
}
