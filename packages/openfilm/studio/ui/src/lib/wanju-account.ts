export interface StudentChat {
  enabled: boolean; authorized?: boolean; displayName: string; priceVersion: string;
  inputPointsPerMillion: number; outputPointsPerMillion: number; reservePoints: number;
  cachedInputPointsPerMillion?: number; cacheWritePointsPerMillion?: number;
  format?: 'chat' | 'responses'; billingMode?: 'wallet' | 'included'; dailyRequestLimit?: number;
  id?: string; label?: string; selectedTier?: string; tiers?: StudentChat[];
}
export interface StudentAccount {
  configured: boolean; authenticated: boolean; warning?: string; ownMediaEnabled?: boolean;
  user?: { id: string; username: string; balance: number };
  heldPoints?: number; chat?: StudentChat;
  ledger?: { id: string; title: string; delta: number; balance: number; created: number }[];
  operations?: { id: string; status: string; reserved: number; charged: number | null; note: string; created: number }[];
  cloud?: { available: boolean; usedBytes: number; completedBytes?: number; reservedBytes?: number; quotaBytes: number; authorized: boolean;
    prices: { enabled: boolean; imagePoints: number; videoPoints: number; priceVersion: string } };
}
interface AccountBridge {
  status(): Promise<StudentAccount>;
  activate(input: { username: string; password: string; code: string }): Promise<StudentAccount>;
  register?(input: { username: string; password: string }): Promise<StudentAccount>;
  login(input: { username: string; password: string }): Promise<StudentAccount>;
  redeem(code: string): Promise<StudentAccount>;
  consent(version: string): Promise<StudentAccount>;
  selectTier?(tier: string, version: string): Promise<StudentAccount>;
  logout(): Promise<StudentAccount>;
  setOwnMediaEnabled(enabled: boolean): Promise<StudentAccount>;
  onChange(listener: () => void): () => void;
}
export interface CloudProject { id: string; title: string; revision: number; updated: number }
export interface CloudProgress { phase: string; completed: number; total?: number }
export interface CloudTrashProject extends CloudProject { trashToken: string; deleted: number }
export interface CloudVersion { revision: number; created: number; files: number; bytes: number }
export interface CloudCleanupPreview { token: string; bytes: number; objects: number; more: boolean; graceHours: number }
export interface CloudAutomaticProject {
  projectId: string; enabled: boolean; phase: string; message: string;
  lastSyncedAt?: number; revision?: number; nextRetryAt?: number;
}
export interface CloudAutomaticStatus { userId?: string; projects: CloudAutomaticProject[]; warning?: string }
interface CloudBridge {
  list(): Promise<{ projects: CloudProject[]; localProjects: { id: string; name: string }[] }>;
  push(input: { projectId: string }): Promise<{ revision: number; files: number; uploaded: number; charged: number; billingWarnings: { taskId: string; message: string }[] }>;
  pull(input: { projectId: string; revision?: number }): Promise<{ revision: number; opened: boolean }>;
  consent(priceVersion: string): Promise<unknown>;
  trashList(): Promise<{ projects: CloudTrashProject[] }>;
  versions(input: { projectId: string; before?: number }): Promise<{ versions: CloudVersion[]; nextBefore: number | null }>;
  trash(input: { projectId: string; revision: number }): Promise<unknown>;
  restore(input: { projectId: string; trashToken: string }): Promise<unknown>;
  purge(input: { projectId: string; trashToken: string; confirmTitle: string }): Promise<unknown>;
  cleanupPreview(): Promise<CloudCleanupPreview>;
  cleanup(input: { token: string; confirm: string }): Promise<{ bytes: number; objects: number; skipped: number; more: boolean }>;
  onProgress(listener: (progress: CloudProgress) => void): () => void;
  automaticStatus?(): Promise<CloudAutomaticStatus>;
  setAutomatic?(input: { projectId: string; enabled: boolean; priceVersion: string }): Promise<CloudAutomaticStatus>;
  onAutomatic?(listener: (status: CloudAutomaticStatus) => void): () => void;
}
const native = (globalThis as { openfilmNative?: { wanju?: { account?: AccountBridge; studentEdition?: boolean; accountMode?: string; cloud?: CloudBridge } } }).openfilmNative?.wanju;
export const wanjuAccount = native?.account;
export const wanjuStudentEdition = native?.studentEdition === true;
export const wanjuUnifiedAccount = native?.accountMode === 'unified';
export const wanjuCloud = native?.cloud;
export const pointsAsYuan = (points: number) => (points / 100).toFixed(2);
export const pointsRateAsYuan = (points: number) => (points / 100).toLocaleString('en-US', {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 6,
});

export function cloudChatAccess(state: StudentAccount | null, reachable = true) {
  if (!reachable) return { ready: false, label: '连接中断，权益待核实' };
  if (!state) return { ready: false, label: '正在读取账户' };
  if (!state.configured) return { ready: false, label: '云端账号服务尚未配置' };
  if (!state.authenticated) return { ready: false, label: '登录后使用云端服务' };
  if (!state.chat?.enabled) return { ready: false, label: '云端创作助手尚未开通' };
  if (state.chat.billingMode === 'included') return { ready: true, label: '默认助手已开通，不扣钱包点数' };
  if (!state.user || state.user.balance <= 0 || state.user.balance < state.chat.reservePoints) {
    return { ready: false, label: '余额不足，请充值' };
  }
  return { ready: true, label: '已开通，按用量扣点' };
}
