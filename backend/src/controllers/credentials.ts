import { Request, Response } from 'express';
import { CredentialsService } from '../services/credentials.js';

export class CredentialsController {
    private credentialsService: CredentialsService;

    constructor() {
        this.credentialsService = CredentialsService.getInstance();
    }

    async list(req: Request, res: Response) {
        try {
            const credentials = await this.credentialsService.list();
            res.json(credentials);
        } catch (error) {
            res.status(500).json({ error: 'Failed to list credentials' });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const credential = await this.credentialsService.create(req.body);
            res.status(201).json(credential);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create credential' });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const credential = await this.credentialsService.update(req.params.id, req.body);
            res.json(credential);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update credential' });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            await this.credentialsService.delete(req.params.id);
            res.status(204).end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete credential' });
        }
    }

    async startCapture(req: Request, res: Response) {
        try {
            // This is an async operation that might take time
            // We start it and return success, or we can wait if we want to block the UI
            // Given it involves manual user action, we should probably handle it asynchronously
            // or block until the browser is closed.
            await this.credentialsService.startAuthCapture(req.params.id);
            res.json({ message: 'Capture completed successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to capture session state' });
        }
    }
}
