/** Windows' installed desktop apps, including user-selected folders outside Programs. */
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, win32 } from 'node:path';

/** The uninstall keys' display names and folders; never run a command taken from the registry. */
export function parseWindowsApps(text, env = process.env) {
  const apps = [];
  let item = {};
  const expand = (value) => value.replace(/%([^%]+)%/g, (whole, name) => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? whole);
  const keep = () => {
    if (!item.DisplayName) return;
    const dirs = [];
    const location = expand(item.InstallLocation ?? '').trim().replace(/^"(.*)"$/, '$1');
    if (isAbsolute(location) || win32.isAbsolute(location)) dirs.push(location);
    const icon = expand(item.DisplayIcon ?? '').trim();
    const iconFile = /^"([^"]+\.(?:exe|ico))"(?:\s*,\s*-?\d+)?$/i.exec(icon)?.[1] ?? /^(.*\.(?:exe|ico))(?:\s*,\s*-?\d+)?$/i.exec(icon)?.[1];
    if (iconFile && (isAbsolute(iconFile) || win32.isAbsolute(iconFile))) dirs.push(win32.isAbsolute(iconFile) ? win32.dirname(iconFile) : dirname(iconFile));
    if (dirs.length) apps.push({ name: item.DisplayName, directories: [...new Set(dirs)] });
  };
  for (const line of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) { keep(); item = {}; continue; }
    const match = /^\s+(DisplayName|InstallLocation|DisplayIcon)\s+REG_(?:EXPAND_)?SZ\s+(.*)$/.exec(line);
    if (match) item[match[1]] = match[2].trim();
  }
  keep();
  return apps;
}

let cached = { at: -Infinity, apps: [] };
/** Cached because agent status is polled; registration alone does not prove the folder still exists. */
export function installedWindowsApps() {
  if (process.platform !== 'win32') return [];
  if (Date.now() - cached.at < 10_000) return cached.apps;
  const system = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const keys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const apps = [];
  for (const key of keys) {
    try {
      // Chinese Windows uses GBK by default; read paths in UTF-8, as environment.mjs does.
      const text = execFileSync(join(system, 'cmd.exe'), ['/d', '/s', '/c', `chcp 65001 >nul && "${join(system, 'reg.exe')}" query "${key}" /s`], {
        encoding: 'utf8', timeout: 2000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'ignore'],
      });
      apps.push(...parseWindowsApps(text));
    } catch { /* a key can be missing or unreadable */ }
  }
  cached = { at: Date.now(), apps };
  return apps;
}
