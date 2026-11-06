import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { prepareWanjuResources, repository } from './wanju-resources.mjs';
import { makeWanjuIcons } from './wanju-icons.mjs';
import { wanjuReleaseOptions } from './wanju-release-options.mjs';
import { replaceReleaseTree } from './release-tree.mjs';
import { createSignPathSigner, inspectSignature, requireValidSignature } from './wanju-signing.mjs';

const require = createRequire(import.meta.url);
const desktop = join(repository, 'apps/desktop');
const dependencyKey = createHash('sha256')
  .update(readFileSync(join(repository, 'pnpm-lock.yaml')))
  .update('wanju-story-docx-pdf-runtime')
  .digest('hex').slice(0, 16);
const stage = join(repository, `.local/desktop-package-${dependencyKey}-${randomUUID()}`);
if (existsSync(stage)) throw new Error('The isolated build stage already exists; refusing to reuse it.');
const runtime = join(repository, '.local/desktop-runtime');
// The legacy --teacher argument remains harmless; new releases have one set of creator rights.
const productName = '玩剧';
const appId = 'local.wanju.studio';
const { version, output, skipUiBuild, bundleBrowser, signing } = wanjuReleaseOptions(process.argv.slice(2), join(dirname(repository), '安装包'));
const signer = signing === 'signpath' ? createSignPathSigner({ version, root: repository }) : null;
if (existsSync(join(output, 'win-unpacked')) || existsSync(join(output, `Wanju-Setup-${version}-x64.exe`))) {
  throw new Error('Build output already contains a release; choose a new output directory.');
}
const localPnpm = join(repository, '.local/tools/pnpm9/package/bin/pnpm.cjs');
const pnpm = process.env.WANJU_PNPM_CLI || (existsSync(localPnpm) ? localPnpm : join(dirname(require.resolve('pnpm')), 'bin/pnpm.cjs'));
if (!existsSync(pnpm)) throw new Error('Set WANJU_PNPM_CLI to the installed pnpm 9 bin/pnpm.cjs file.');
const run = (file, args, cwd = repository, extra = {}) => execFileSync(file, args, { cwd, stdio: 'inherit', ...extra });
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This build is for Windows x64.');

if (!skipUiBuild) {
  await makeWanjuIcons();
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  run(process.execPath, [vite, 'build', '--config', 'shell/vite.config.ts'], desktop);
  run(process.execPath, [vite, 'build', '--config', 'studio/ui/vite.config.ts', '--emptyOutDir=true'], join(repository, 'packages/openfilm'));
}
if (!existsSync(join(desktop, 'shell/dist/index.html')) || !existsSync(join(desktop, 'build/wanju.ico'))) {
  throw new Error('Build the shell and icons before using --skip-ui-build.');
}
if (!existsSync(join(stage, 'node_modules/openfilm/package.json'))) {
  if (existsSync(stage)) throw new Error('Incomplete stage exists; inspect .local/desktop-package before rebuilding.');
  run(process.execPath, [pnpm, '--filter', '@openfilm/desktop', '--prod', '--no-optional',
    'deploy', resolve(stage), '--ignore-scripts', '--prefer-offline']);
}
// Refresh only app-owned files; deployment keeps the tested production dependency graph.
replaceReleaseTree(join(desktop, 'src'), join(stage, 'src'), stage, { filter: (file) => !file.endsWith('.test.mjs') });
replaceReleaseTree(join(desktop, 'shell/dist'), join(stage, 'shell/dist'), stage);
const protocol = join(stage, 'node_modules/openfilm');
// Pi can load TypeScript tools at runtime. Keep the Windows compiler binary even though the large agent binaries
// are optional and intentionally use the person's separately installed Codex/Claude.
for (const entry of readdirSync(join(stage, 'node_modules/.pnpm')).filter((name) => /^esbuild@\d/.test(name))) {
  const version = entry.slice('esbuild@'.length);
  const compiler = join(repository, `node_modules/.pnpm/@esbuild+win32-x64@${version}/node_modules/@esbuild/win32-x64`);
  if (!existsSync(compiler)) throw new Error(`The tested esbuild Windows runtime ${version} is missing from the source install.`);
  cpSync(compiler, join(stage, 'node_modules', '.pnpm', entry, 'node_modules/@esbuild/win32-x64'), { recursive: true });
}
/* Every part the package owns must be refreshed, not just the code: `skills-extra` is a directory added after the
   deploy, and the deploy is kept between builds, so a part left out here never reaches the installer at all. */
for (const part of ['bin', 'src', 'skills', 'skills-extra', 'studio/server', 'studio/ui/dist']) {
  replaceReleaseTree(join(repository, 'packages/openfilm', part), join(protocol, part), stage,
    { filter: (file) => !file.endsWith('.test.mjs') });
}
writeFileSync(join(protocol, 'THIRD_PARTY_NOTICES.md.wanju'), readFileSync(join(repository, 'packages/openfilm/THIRD_PARTY_NOTICES.md')));
renameSync(join(protocol, 'THIRD_PARTY_NOTICES.md.wanju'), join(protocol, 'THIRD_PARTY_NOTICES.md'));
// Deploy preserves a previous manifest; refresh the app-owned export for the entitlement bridge.
const protocolManifest = JSON.parse(readFileSync(join(protocol, 'package.json'), 'utf8'));
protocolManifest.exports['./wanju-access'] = './studio/server/wanju-access.mjs';
protocolManifest.exports['./wanju-media'] = './studio/server/wanju-media.mjs';
protocolManifest.exports['./wanju-assets'] = './studio/server/wanju-assets.mjs';
protocolManifest.exports['./podcast-cut'] = './studio/server/podcast-cut.mjs';
writeFileSync(join(protocol, 'package.json.wanju'), JSON.stringify(protocolManifest, null, 2));
renameSync(join(protocol, 'package.json.wanju'), join(protocol, 'package.json'));
const productSource = join(repository, 'packages/openfilm/product.json');
const productTarget = join(protocol, 'product.json');
if (statSync(productSource).ino !== statSync(productTarget).ino) cpSync(productSource, productTarget);
const manifest = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'));
Object.assign(manifest, {
  name: 'wanju-studio', productName, version, main: 'src/wanju-main.mjs',
  description: '玩剧：对话创作、AI 素材与 OpenFilm 时间线编辑', author: 'Wanju local build', license: 'MIT',
  packageManager: 'traversal',
  wanjuChannel: version.includes('-') ? 'preview' : 'stable',
});
delete manifest.devDependencies;
delete manifest.scripts;
// pnpm deploy may hard-link workspace files: replace the staged manifest atomically.
writeFileSync(join(stage, 'package.json.wanju'), JSON.stringify(manifest, null, 2));
renameSync(join(stage, 'package.json.wanju'), join(stage, 'package.json'));
cpSync(join(repository, 'LICENSE'), join(stage, 'LICENSE'));
cpSync(join(repository, 'packages/openfilm/TRADEMARK.md'), join(stage, 'OPENFILM-TRADEMARK.md'));
const resources = prepareWanjuResources(undefined, { studentEdition: false });
cpSync(join(desktop, 'build/wanju.png'), join(resources, 'icon.png'));
mkdirSync(join(runtime, 'ffmpeg'), { recursive: true });
const ffmpeg = process.env.WANJU_FFMPEG_DIR || join(repository, '.local/tools/ffmpeg/ffmpeg-9.0.2-essentials_build');
for (const name of ['ffmpeg.exe', 'ffprobe.exe']) cpSync(join(ffmpeg, 'bin', name), join(runtime, 'ffmpeg', name));
for (const name of ['LICENSE', 'README.txt']) {
  if (existsSync(join(ffmpeg, name))) cpSync(join(ffmpeg, name), join(runtime, 'ffmpeg', name));
}
const browserReady = () => existsSync(join(runtime, 'ms-playwright'))
  && readdirSync(join(runtime, 'ms-playwright')).some((name) => name.startsWith('chromium_headless_shell-')
    && existsSync(join(runtime, 'ms-playwright', name, 'INSTALLATION_COMPLETE')));
if (bundleBrowser && !browserReady()) {
  run(process.execPath, [join(dirname(require.resolve('playwright-core/package.json')), 'cli.js'), 'install', 'chromium-headless-shell'], repository,
    { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(runtime, 'ms-playwright') } });
}
mkdirSync(output, { recursive: true });
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_MIRROR ||= 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||= 'https://npmmirror.com/mirrors/electron-builder-binaries/';
const { build } = require('electron-builder');
const electronVersion = require('electron/package.json').version;
const result = await build({
  projectDir: stage, publish: 'never', win: ['nsis'], x64: true,
  config: {
    appId, productName, executableName: 'Wanju', npmRebuild: false,
    electronVersion, electronDist: join(dirname(require.resolve('electron/package.json')), 'dist'),
    asar: true, asarUnpack: ['node_modules/**', 'src/as-node.mjs'],
    files: ['src/**/*', 'shell/dist/**/*', 'LICENSE', 'OPENFILM-TRADEMARK.md', 'package.json', 'node_modules/**/*',
      '!**/*.test.mjs', '!**/.local/**', '!**/test/**', '!**/tests/**'],
    extraResources: [{ from: resources, to: 'wanju' }, { from: join(runtime, 'ffmpeg'), to: 'runtime/ffmpeg' },
      ...(browserReady() ? [{ from: join(runtime, 'ms-playwright'), to: 'runtime/ms-playwright', filter: ['**/*', '!**/__dirlock/**', '!**/.links/**'] }] : [])],
    directories: { output, buildResources: join(desktop, 'build') },
    forceCodeSigning: Boolean(signer),
    win: { target: 'nsis', icon: join(desktop, 'build/wanju.ico'), signAndEditExecutable: Boolean(signer),
      ...(signer ? { signtoolOptions: { sign: signer.sign, signingHashAlgorithms: ['sha256'] } } : {}),
      artifactName: 'Wanju-Setup-${version}-${arch}.${ext}' },
    nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false, shortcutName: productName,
      installerIcon: join(desktop, 'build/wanju.ico'), uninstallerIcon: join(desktop, 'build/wanju.ico'),
      installerLanguages: ['zh_CN', 'en_US'], language: '2052',
      artifactName: 'Wanju-Setup-${version}-${arch}.${ext}' },
    electronFuses: { runAsNode: true, enableCookieEncryption: true, enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true },
    publish: null,
    afterPack: async ({ appOutDir }) => {
      const ResEdit = await import('resedit');
      const PE = await import('pe-library');
      const file = join(appOutDir, 'Wanju.exe');
      const exe = PE.NtExecutable.from(readFileSync(file), { ignoreCert: true });
      const res = PE.NtExecutableResource.from(exe);
      const icon = ResEdit.Data.IconFile.from(readFileSync(join(desktop, 'build/wanju.ico')));
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icon.icons.map((item) => item.data));
      const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
      const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
      info.setFileVersion(major, minor, patch, 0, 1033);
      info.setProductVersion(major, minor, patch, 0, 1033);
      info.setStringValues({ lang: 1033, codepage: 1200 }, {
        ProductName: productName, FileDescription: productName, CompanyName: 'Wanju', OriginalFilename: 'Wanju.exe',
        InternalName: 'Wanju', FileVersion: version, ProductVersion: version,
      });
      info.outputToResourceEntries(res.entries);
      res.outputResource(exe);
      writeFileSync(file, Buffer.from(exe.generate()));
    },
  },
});
const runtimeRequire = createRequire(join(output, 'win-unpacked/resources/app.asar.unpacked/runtime-check.cjs'));
runtimeRequire('esbuild').transformSync('const duration: number = 4;', { loader: 'ts' });
const signatures = [join(output, 'win-unpacked/Wanju.exe'), join(output, `Wanju-Setup-${version}-x64.exe`)]
  .map((file) => ({ file, ...inspectSignature(file) }));
if (signer) {
  for (const signature of signatures) requireValidSignature(signature, signer.expectedSubject);
  if (!signer.signedFiles.some((file) => file.file.endsWith('__uninstaller.exe'))) throw new Error('The uninstaller was not signed.');
}
writeFileSync(join(repository, '.local/desktop-release.json'), JSON.stringify({
  version, output, exe: join(output, 'win-unpacked/Wanju.exe'), artifacts: result,
  unsigned: !signer, signingProvider: signer ? 'signpath' : null, signatures,
  signedFiles: signer?.signedFiles || [], bundled_credentials: false, system_edge: !browserReady(),
}, null, 2));
console.log(JSON.stringify({ edition: 'unified', version, output, artifacts: result, unsigned: !signer, bundled_credentials: false }));
