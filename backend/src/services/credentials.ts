import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { Credential, CreateCredentialDto, UpdateCredentialDto } from '../types/credentials.js';
import { PlaywrightService } from './playwright.js';

export class CredentialsService {
    private static instance: CredentialsService;
    private playwrightService: PlaywrightService;

    private constructor() {
        this.playwrightService = new PlaywrightService();
    }

    public static getInstance(): CredentialsService {
        if (!CredentialsService.instance) {
            CredentialsService.instance = new CredentialsService();
        }
        return CredentialsService.instance;
    }

    private async readCredentials(): Promise<Credential[]> {
        try {
            const data = await fs.readFile(config.credentialsFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    private async writeCredentials(credentials: Credential[]): Promise<void> {
        await fs.writeFile(config.credentialsFile, JSON.stringify(credentials, null, 2));
    }

    async list(): Promise<Credential[]> {
        return this.readCredentials();
    }

    async getById(id: string): Promise<Credential | null> {
        const credentials = await this.readCredentials();
        return credentials.find(c => c.id === id) || null;
    }

    async create(data: CreateCredentialDto): Promise<Credential> {
        const credentials = await this.readCredentials();
        const newCredential: Credential = {
            id: uuidv4(),
            ...data,
            isVerified: false,
            createdAt: new Date().toISOString(),
        };
        credentials.push(newCredential);
        await this.writeCredentials(credentials);
        return newCredential;
    }

    async update(id: string, data: UpdateCredentialDto): Promise<Credential> {
        const credentials = await this.readCredentials();
        const index = credentials.findIndex(c => c.id === id);
        if (index === -1) throw new Error('Credential not found');

        credentials[index] = { ...credentials[index], ...data };
        await this.writeCredentials(credentials);
        return credentials[index];
    }

    async delete(id: string): Promise<void> {
        const credentials = await this.readCredentials();
        const filtered = credentials.filter(c => c.id !== id);
        await this.writeCredentials(filtered);
    }

    async startAuthCapture(id: string): Promise<void> {
        const credentials = await this.readCredentials();
        const index = credentials.findIndex(c => c.id === id);
        if (index === -1) throw new Error('Credential not found');

        const credential = credentials[index];

        // Launch browser for manual login
        try {
            const result = await this.playwrightService.launchBrowser({
                recordActions: false,
                recordConsole: false,
                recordNetwork: false,
                recordVideo: false,
                initialUrl: credential.targetUrl,
                resolution: 'HD'
            }, `auth_${id}`);

            // Wait for the user to close the browser
            // We'll use a promise that resolves when the page or browser is closed
            await new Promise<void>((resolve) => {
                result.page.on('close', () => resolve());
                result.browser.on('disconnected', () => resolve());
            });

            // After closing, capture the storage state
            const storageState = await result.context.storageState();

            // Update credential
            credentials[index].storageState = JSON.stringify(storageState);
            credentials[index].isVerified = true;
            await this.writeCredentials(credentials);

            await this.playwrightService.close();
        } catch (error) {
            console.error('Error during auth capture:', error);
            await this.playwrightService.close();
            throw error;
        }
    }
}
