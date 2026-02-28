// Base URL from environment variable
export const API_URL = import.meta.env.VITE_API_URL || '';

export function apiUrl(path) {
    return `${API_URL}${path}`;
}
