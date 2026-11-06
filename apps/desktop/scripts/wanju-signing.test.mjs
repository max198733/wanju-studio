import test from 'node:test';
import assert from 'node:assert/strict';
import { isWanjuSigningTarget, requireValidSignature, signPathConfiguration } from './wanju-signing.mjs';

test('unsigned, untrusted, untimestamped and different-publisher files cannot pass the release gate', () => {
  const good = { status: 'Valid', subject: 'CN=Approved Publisher', timestampSubject: 'CN=Timestamp CA' };
  assert.equal(requireValidSignature(good, good.subject), good);
  for (const change of [{ status: 'NotSigned' }, { status: 'UnknownError' }, { timestampSubject: '' }, { subject: 'CN=Other' }]) {
    assert.throws(() => requireValidSignature({ ...good, ...change }, good.subject));
  }
  assert.throws(() => requireValidSignature(good, ''));
});

test('Foundation signing is limited to the Wanju application, installer and uninstaller', () => {
  for (const file of ['Wanju.exe', 'Wanju-Setup-2.1.0-x64.exe', 'Wanju-Setup-2.1.0-x64.__uninstaller.exe']) {
    assert.equal(isWanjuSigningTarget(file, '2.1.0'), true);
  }
  for (const file of ['ffmpeg.exe', 'ffprobe.exe', 'chrome.exe', 'Wanju-Setup-2.0.4-x64.exe', 'vendor.dll']) {
    assert.equal(isWanjuSigningTarget(file, '2.1.0'), false);
  }
});

test('missing credentials and local runners fail before a build can claim signing', () => {
  assert.throws(() => signPathConfiguration({}), /GitHub-hosted/);
  assert.throws(() => signPathConfiguration({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' }), /GitHub-hosted/);
  assert.throws(() => signPathConfiguration({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }), /SIGNPATH_API_TOKEN/);
});
