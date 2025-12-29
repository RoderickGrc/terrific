import { Router } from 'express';
import { CredentialsController } from '../controllers/credentials.js';

const router = Router();
const controller = new CredentialsController();

router.get('/', (req, res) => controller.list(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));
router.post('/:id/capture', (req, res) => controller.startCapture(req, res));

export default router;
