// Only Electron's parent process supplies this state, after verifying the cloud session.
import { createHash } from 'node:crypto';
import { join } from 'node:path';

let access = { authenticated: false, ownMediaEnabled: false, expiresAt: 0, userId: '' };
export function studentProviderDirectory(base, userId) {
  if (!base || typeof userId !== 'string' || !userId) throw new Error('学员配置目录尚未就绪。');
  return join(base, 'students', createHash('sha256').update(userId).digest('hex').slice(0, 32));
}
export function setWanjuAccess(value) {
  access = {
    authenticated: value?.authenticated === true,
    ownMediaEnabled: value?.ownMediaEnabled === true,
    expiresAt: Number(value?.expiresAt) || 0,
    userId: typeof value?.userId === 'string' ? value.userId : '',
  };
}
export function wanjuAccess(now = Date.now()) {
  const student = process.env.WANJU_STUDENT_EDITION === '1' && process.env.WANJU_ACCOUNT_MODE !== 'unified';
  const authenticated = student && access.authenticated && Boolean(access.userId) && access.expiresAt > now;
  return {
    student, authenticated, ownMediaEnabled: authenticated && access.ownMediaEnabled,
    localMediaAllowed: !student || (authenticated && access.ownMediaEnabled),
    managedMediaAvailable: false,
  };
}
export function wanjuConfigDirectory() {
  const rights = wanjuAccess();
  if (!rights.student) return process.env.WANJU_CONFIG_DIR;
  return rights.localMediaAllowed ? studentProviderDirectory(process.env.WANJU_CONFIG_DIR, access.userId) : undefined;
}
export function wanjuCloudOwner(now = Date.now()) {
  return access.authenticated && access.userId && access.expiresAt > now ? access.userId : '';
}
