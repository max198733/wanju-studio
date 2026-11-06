import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

export function signPathConfiguration(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('SignPath signing requires a GitHub-hosted Actions runner.');
  }
  const required = ['SIGNPATH_API_TOKEN', 'SIGNPATH_ORGANIZATION_ID', 'SIGNPATH_PROJECT_SLUG',
    'SIGNPATH_SIGNING_POLICY_SLUG', 'SIGNPATH_ARTIFACT_CONFIGURATION_SLUG', 'WANJU_SIGN_EXPECTED_SUBJECT',
    'SIGNPATH_ACTION_DIRECTORY'];
  for (const name of required) if (!env[name]?.trim()) throw new Error(`Missing signing configuration: ${name}`);
  const action = resolve(env.SIGNPATH_ACTION_DIRECTORY, 'index.js');
  if (!existsSync(action)) throw new Error('The pinned SignPath action has not been checked out.');
  return { action, expectedSubject: env.WANJU_SIGN_EXPECTED_SUBJECT };
}

export function requireValidSignature(signature, expectedSubject) {
  if (signature.status !== 'Valid' || !signature.subject || !signature.timestampSubject) {
    throw new Error('A trusted, timestamped Authenticode signature is required.');
  }
  if (!expectedSubject || signature.subject !== expectedSubject) throw new Error('Unexpected signing certificate subject.');
  return signature;
}

export function inspectSignature(file) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$ProgressPreference = "SilentlyContinue"',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '$s = Get-AuthenticodeSignature -LiteralPath $env:WANJU_SIGNATURE_FILE',
    '[pscustomobject]@{status=[string]$s.Status;subject=[string]$s.SignerCertificate.Subject;',
    'thumbprint=[string]$s.SignerCertificate.Thumbprint;timestampSubject=[string]$s.TimeStamperCertificate.Subject} | ConvertTo-Json -Compress',
  ].join('\n');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const text = execFileSync(join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, WANJU_SIGNATURE_FILE: resolve(file),
      PSModulePath: join(systemRoot, 'System32/WindowsPowerShell/v1.0/Modules') },
    timeout: 60000,
  });
  return JSON.parse(text.replace(/^\uFEFF/, '').trim());
}

export function isWanjuSigningTarget(file, version) {
  const name = basename(file);
  return name === 'Wanju.exe' || name === `Wanju-Setup-${version}-x64.exe`
    || name === `Wanju-Setup-${version}-x64.__uninstaller.exe`;
}

export function createSignPathSigner({ version, root, env = process.env }) {
  const configuration = signPathConfiguration(env);
  const signedFiles = [];
  const sign = async ({ path: file, hash }) => {
    // Vendor binaries retain their original publisher; the Foundation signs our own artifacts only.
    if (!isWanjuSigningTarget(file, version)) return;
    if (hash !== 'sha256') throw new Error('Only SHA-256 signing is supported.');
    const id = randomUUID();
    const output = join(root, '.local/signpath', id);
    await mkdir(output, { recursive: true });
    const { DefaultArtifactClient } = await import('@actions/artifact');
    const client = new DefaultArtifactClient();
    const artifact = await client.uploadArtifact(`wanju-sign-${id}`, [resolve(file)], dirname(resolve(file)), {
      retentionDays: 1, compressionLevel: 0,
    });
    if (!artifact.id) throw new Error('GitHub did not return a signing artifact ID.');
    const inputs = {
      'api-token': env.SIGNPATH_API_TOKEN, 'organization-id': env.SIGNPATH_ORGANIZATION_ID,
      'project-slug': env.SIGNPATH_PROJECT_SLUG, 'signing-policy-slug': env.SIGNPATH_SIGNING_POLICY_SLUG,
      'artifact-configuration-slug': env.SIGNPATH_ARTIFACT_CONFIGURATION_SLUG,
      'github-artifact-id': String(artifact.id), 'github-token': env.GITHUB_TOKEN,
      'wait-for-completion': 'true', 'wait-for-completion-timeout-in-seconds': '1800',
      'service-unavailable-timeout-in-seconds': '300', 'download-signed-artifact-timeout-in-seconds': '300',
      'output-artifact-directory': output, 'skip-decompress': 'false',
      'connector-url': 'https://pipelineconnector.connectors.signpath.io/GitHubActions/GitHubCom',
    };
    await new Promise((done, reject) => {
      const child = spawn(process.execPath, [configuration.action], {
        stdio: 'inherit', windowsHide: true,
        env: { ...env, ...Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== undefined)
          .map(([name, value]) => [`INPUT_${name.toUpperCase()}`, value])) },
      });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? done() : reject(new Error('SignPath did not complete signing.')));
    });
    const candidate = join(output, basename(file));
    if (!(await stat(candidate)).isFile()) throw new Error('The signed file was not returned.');
    const signature = requireValidSignature(inspectSignature(candidate), configuration.expectedSubject);
    await copyFile(candidate, file);
    signedFiles.push({ file: basename(file), ...signature });
  };
  return { sign, signedFiles, expectedSubject: configuration.expectedSubject };
}
