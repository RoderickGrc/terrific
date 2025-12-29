export interface Credential {
    id: string;            // UUID
    alias: string;         // Descriptive name (e.g., "Local Admin")
    username?: string;     // Optional username for reference
    email?: string;        // Optional email for reference
    targetUrl: string;     // URL where login was performed
    storageState?: string; // Serialized Playwright StorageState (JSON string)
    isVerified: boolean;   // Whether the state was successfully captured
    createdAt: string;     // ISO timestamp
    lastUsedAt?: string;   // Last time it was used
}

export interface CreateCredentialDto {
    alias: string;
    username?: string;
    email?: string;
    targetUrl: string;
}

export interface UpdateCredentialDto {
    alias?: string;
    username?: string;
    email?: string;
}
