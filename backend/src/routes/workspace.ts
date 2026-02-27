import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspace.js';

const router = Router();
const workspaceController = new WorkspaceController();

router.post('/', workspaceController.getOrCreateWorkspace.bind(workspaceController));
router.get('/:workspaceHash', workspaceController.getWorkspace.bind(workspaceController));
router.get('/', workspaceController.listWorkspaces.bind(workspaceController));

export default router;
