import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindowsApps } from './windows-apps.mjs';

test('Windows app registrations retain custom folders, quoted paths, spaces and non-ASCII names', () => {
  const apps = parseWindowsApps(String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\deepseek
    DisplayName    REG_SZ    DeepSeek Harness 0.2.1-rc.3
    InstallLocation    REG_SZ    "D:\Apps\DeepSeek Harness"
    DisplayIcon    REG_SZ    "D:\Apps\DeepSeek Harness\DeepSeek Harness.exe",0

HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall\opencode
    DisplayName    REG_SZ    OpenCode 2.1.4
    DisplayIcon    REG_SZ    D:\Apps\视频工具\OpenCode.exe,0
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\minimax
    DisplayName    REG_SZ    MiniMax Code 3.1.4
    DisplayIcon    REG_SZ    D:\Apps\MiniMax Code\uninstallerIcon.ico
`);
  assert.deepEqual(apps, [
    { name: 'DeepSeek Harness 0.2.1-rc.3', directories: [String.raw`D:\Apps\DeepSeek Harness`] },
    { name: 'OpenCode 2.1.4', directories: [String.raw`D:\Apps\视频工具`] },
    { name: 'MiniMax Code 3.1.4', directories: [String.raw`D:\Apps\MiniMax Code`] },
  ]);
});

test('registrations expand environment paths without treating uninstall commands as locations', () => {
  const apps = parseWindowsApps(String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\copilot
    DisplayName    REG_SZ    GitHub Copilot
    InstallLocation    REG_EXPAND_SZ    %LOCALAPPDATA%\Programs\GitHub Copilot
    UninstallString    REG_SZ    "D:\Other\uninstall.exe" --remove
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\incomplete
    DisplayName    REG_SZ    Cursor
    InstallLocation    REG_SZ    relative\folder
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\nameless
    DisplayIcon    REG_SZ    D:\Other\Other.exe,0
`, { LocalAppData: String.raw`D:\Local` });
  assert.deepEqual(apps, [{ name: 'GitHub Copilot', directories: [String.raw`D:\Local\Programs\GitHub Copilot`] }]);
});
