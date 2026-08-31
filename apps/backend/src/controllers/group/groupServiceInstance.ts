import { GroupService } from '../../services/groupService';

/**
 * The single, module-level `GroupService` instance shared by every group
 * handler module. It is instantiated exactly once, at import time, exactly as
 * the pre-split `groupController.ts` did — the handler modules import this
 * instance rather than constructing their own.
 */
export const groupService = new GroupService();
