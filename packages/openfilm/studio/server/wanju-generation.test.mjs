import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { blankState } from './wanju-model.mjs';
import { downloadPublic, generateOne, generationTasks, h3Request, imageRequest, imageUrl, publicIP, queryImage, queryH3, taskSummary } from './wanju-generation.mjs';
import { h3SingleRequest } from './wanju-h3-single.mjs';

const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKQAAAAASUVORK5CYII=', 'base64');
const shot = { id: 'S001', title: '开场', description: '远景，海边的老照片。', dialogue: '', duration: 4, media: 'assets/reference.png' };
const state = { ...blankState(), shots: [shot] };
const dependencies = {
  config: async () => ({ api_key: 'SAMPLE_SECRET_DO_NOT_EXPOSE', model: 'test-model' }),
  probe: async () => ({ width: 100, height: 100, duration: 4 }),
};
async function project() {
  const path = await mkdtemp(join(tmpdir(), 'wanju-generation-'));
  await mkdir(join(path, '.film'));
  await mkdir(join(path, 'assets'));
  await writeFile(join(path, shot.media), picture);
  return { id: 'test-project', path, name: '测试' };
}

test('image edits use repeated image fields, never image[] or JSON URL references', () => {
  const request = imageRequest({ model: 'model', prompt: 'prompt', references: [{ bytes: picture, type: 'image/png', name: 'a.png' }, { bytes: picture, type: 'image/png', name: 'b.png' }] });
  assert.equal(request.endpoint, '/v1/images/edits');
  assert.equal(request.body.getAll('image').length, 2);
  assert.equal(request.body.has('image[]'), false);
  assert.deepEqual(request.headers, {});
  const text = imageRequest({ model: 'model', prompt: 'prompt' });
  assert.equal(text.endpoint, '/v1/images/generations');
  assert.equal(JSON.parse(text.body).n, 1);
  assert.equal(JSON.parse(text.body).response_format, 'b64_json');
  assert.equal(request.body.get('response_format'), 'b64_json');
  assert.equal(JSON.parse(imageRequest({ model: 'm', prompt: 'p', responseFormat: 'url' }).body).response_format, 'url');
  assert.throws(() => imageRequest({ model: 'm', prompt: 'p', responseFormat: 'invalid' }), /未提交/);
});
test('inline image response saves actual bytes without a second download or billable retry', async () => {
  const p = await project();
  let submissions = 0;
  const task = await generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, {
    ...dependencies,
    fetch: async (_url, init) => {
      submissions++;
      assert.equal(JSON.parse(init.body).response_format, 'b64_json');
      return Response.json({ data: [{ b64_json: picture.toString('base64') }] });
    },
    download: async () => assert.fail('inline bytes need no CDN download'),
  });
  assert.equal(task.status, 'done');
  assert.equal(submissions, 1);
  assert.deepEqual(await readFile(join(p.path, task.path)), picture);
});
test('failed image delivery recovers the persisted result without a new paid request or leaking signed links', async () => {
  const p = await project();
  const url = 'https://example.com/result.png?signature=PRIVATE_RESULT_LINK';
  let submissions = 0, downloads = 0;
  const deps = {
    ...dependencies,
    fetch: async () => { submissions++; return Response.json({ data: [{ url }] }); },
    download: async (value) => {
      assert.equal(value, url);
      if (++downloads === 1) throw new Error('temporary CDN failure');
      return { bytes: picture };
    },
  };
  await assert.rejects(generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, deps), /处理失败/);
  const [failed] = await generationTasks(p.path);
  assert.equal(failed.status, 'download-failed');
  assert.equal(taskSummary(failed).recoveryAvailable, true);
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_RESULT_LINK|example\.com|SAMPLE_SECRET/);
  await assert.rejects(generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, deps), /未结束/);
  const noPaidCall = { ...deps, config: () => assert.fail('recovery needs no API key'), fetch: () => assert.fail('no new paid request') };
  const done = await queryImage(p, failed.id, noPaidCall);
  assert.equal(done.id, failed.id);
  assert.equal(done.status, 'done');
  assert.equal(done.recoveryAvailable, false);
  assert.deepEqual(await readFile(join(p.path, done.path)), picture);
  assert.equal(submissions, 1);
  assert.equal(downloads, 2);
  await assert.rejects(readFile(join(p.path, '.film/wanju-image-results', `${done.id}.json`)), { code: 'ENOENT' });
  await queryImage(p, failed.id, noPaidCall);
  assert.equal(downloads, 2, 'completed result is idempotent');
});
test('inline images survive local probe failures and preserve rejected-reference evidence on recovery', async () => {
  const p = await project();
  await assert.rejects(generateOne(p, state, { provider: 'image', shot: 'S001', useReference: true, confirm: true }, {
    ...dependencies,
    fetch: async () => Response.json({ data: [{ b64_json: picture.toString('base64') }], usage: { input_tokens_details: { image_tokens: 0 } } }),
    probe: async () => { throw new Error('temporary probe failure'); },
  }));
  const [failed] = await generationTasks(p.path);
  const recovered = await queryImage(p, failed.id, {
    ...dependencies, fetch: () => assert.fail('no new generation'), download: () => assert.fail('inline image has bytes'),
  });
  assert.equal(recovered.status, 'reference-rejected');
  assert.equal(recovered.imageTokens, 0);
  assert.equal(recovered.recoveryAvailable, false);
  assert.equal((await generationTasks(p.path)).length, 1);
});
test('legacy failed image tasks without a saved result are explained and never resubmitted', async () => {
  const p = await project();
  const id = '00000000-0000-4000-8000-000000000001';
  await writeFile(join(p.path, '.film/wanju-tasks.json'), JSON.stringify([{ id, provider: 'image', shot: 'S001', status: 'download-failed' }]));
  await assert.rejects(queryImage(p, id, { fetch: () => assert.fail('no paid fallback') }), /旧版本可能没有保存/);
  assert.equal((await generationTasks(p.path))[0].status, 'download-failed');
});
test('a restored task index never advertises a private recovery receipt missing on this computer', async () => {
  const p = await project();
  const task = { id: '00000000-0000-4000-8000-000000000002', provider: 'image', shot: 'S001', status: 'download-failed', recoveryAvailable: true };
  await writeFile(join(p.path, '.film/wanju-tasks.json'), JSON.stringify([task]));
  const [read] = await generationTasks(p.path);
  assert.equal(read.recoveryAvailable, false);
  assert.match(read.error, /在原电脑恢复/);
  assert.equal(JSON.parse(await readFile(join(p.path, '.film/wanju-tasks.json'), 'utf8'))[0].recoveryAvailable, true, 'reads do not rewrite the original record');
});
test('H3 validates duration, ratio and image type before any billable call', () => {
  assert.throws(() => h3Request({ ...shot, duration: 2 }, '9:16', 'https://example.com/reference.png'));
  assert.throws(() => h3Request(shot, '1:1', 'https://example.com/reference.png'));
  assert.throws(() => h3Request({ ...shot, media: 'assets/a.mp4' }, '9:16', 'https://example.com/reference.png'));
  const body = h3Request(shot, '9:16', 'https://example.com/reference.png');
  assert.equal(body.ref_image_0, 'https://example.com/reference.png');
  assert.equal(body.resolution, '768p竖');
  assert.equal(body.duration, 4);
  assert.equal('ref_audio_0' in body, false);
});
test('H3 single-image request is strictly one first frame and does not send unsupported inputs', () => {
  const body = h3SingleRequest(shot, '9:16', {}, publicIP);
  assert.deepEqual(Object.keys(body).sort(), ['duration', 'prompt', 'ref_image_0', 'resolution']);
  assert.equal(body.ref_image_0, shot.media);
  assert.equal(body.resolution, '768p竖');
  assert.throws(() => h3SingleRequest(shot, '1:1', {}, publicIP), /只支持/);
  assert.throws(() => h3SingleRequest({ ...shot, duration: 16 }, '9:16', {}, publicIP), /1–15/);
  assert.throws(() => h3SingleRequest(shot, '9:16', { imageUrls: [shot.media, shot.media] }, publicIP), /一张/);
  assert.throws(() => h3SingleRequest(shot, '9:16', { audioUrls: ['assets/music.mp3'] }, publicIP), /不发送参考音频/);
});
test('confirmation is mandatory and private download addresses are refused without networking', async () => {
  assert.equal(publicIP('127.0.0.1'), false);
  assert.equal(publicIP('192.168.1.10'), false);
  assert.equal(publicIP('::1'), false);
  assert.equal(publicIP('::ffff:10.0.0.1'), false);
  assert.equal(publicIP('8.8.8.8'), true);
  await assert.rejects(downloadPublic('https://127.0.0.1/file.png'));
  await assert.rejects(downloadPublic('http://example.com/file.png'));
  await assert.rejects(generateOne(await project(), state, { provider: 'image', shot: 'S001' }, dependencies), /确认/);
});
test('zero image-token evidence saves result but never marks reference generation successful', async () => {
  const p = await project();
  const task = await generateOne(p, state, { provider: 'image', shot: 'S001', useReference: true, confirm: true }, {
    ...dependencies, fetch: async () => Response.json({ data: [{ b64_json: picture.toString('base64') }], usage: { input_tokens_details: { image_tokens: 0 } } }),
  });
  assert.equal(task.status, 'reference-rejected');
  assert.deepEqual(await readFile(join(p.path, task.path)), picture);
  assert.doesNotMatch(JSON.stringify(await generationTasks(p.path)), /SAMPLE_SECRET/);
});
test('H3 submission is persisted once and querying resumes the same remote task', async () => {
  const p = await project();
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    return Response.json(url.includes('/result/') ? { data: { status: 'SUCCESS', results: [{ type: 'video', alias: 'final_video', url: 'https://example.com/result.mp4' }] } } : { data: { task_id: 'remote-001' } });
  };
  const deps = { ...dependencies, fetch, uploadCos: async () => 'https://example.com/reference.png', download: async () => ({ bytes: Buffer.from('mock-video') }) };
  const task = await generateOne(p, state, { provider: 'h3', shot: 'S001', confirm: true }, deps);
  assert.equal(task.remoteId, 'remote-001');
  await assert.rejects(generateOne(p, state, { provider: 'h3', shot: 'S001', confirm: true }, deps), /未结束/);
  assert.equal(urls.length, 1);
  const done = await queryH3(p, task.id, deps);
  assert.equal(done.status, 'done');
  assert.equal(done.timing.queryCount, 1);
  assert.ok(done.timing.submitMs >= 0);
  assert.ok(done.timing.remoteWaitMs >= 0);
  assert.ok(done.timing.downloadMs >= 0);
  assert.ok(done.timing.totalMs >= done.timing.remoteWaitMs);
  await queryH3(p, task.id, deps);
  assert.equal(urls.length, 2);
  assert.ok(urls[1].endsWith('/result/remote-001'));
  assert.doesNotMatch(JSON.stringify(taskSummary(done)), /SAMPLE_SECRET|example\.com/);
});
test('H3 single-image line submits one first frame and immediately saves a completed video', async () => {
  const p = await project();
  const sent = [];
  const done = await generateOne(p, state, { provider: 'h3_zm_nono', shot: 'S001', confirm: true }, {
    ...dependencies,
    uploadCos: async (_project, path) => { assert.equal(path, shot.media); return 'https://cos.example.com/first-frame.png'; },
    fetch: async (url, init) => {
      sent.push({ url, init });
      return Response.json({ code: 'Success', data: { status: 'completed', task_id: 'single-001', results: [
        { type: 'video', file_type: 'mp4', output_type: 'output', url: 'https://signed.example.com/output.mp4?token=temporary' },
      ] } });
    },
    download: async (url) => {
      assert.equal(url, 'https://signed.example.com/output.mp4?token=temporary');
      return { bytes: Buffer.from('mock-video') };
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_zm_nono');
  assert.equal(sent[0].init.headers.Authorization, 'SAMPLE_SECRET_DO_NOT_EXPOSE');
  const payload = JSON.parse(sent[0].init.body);
  assert.equal(payload.ref_image_0, 'https://cos.example.com/first-frame.png');
  assert.equal(payload.resolution, '768p竖');
  assert.equal(payload.duration, shot.duration);
  assert.deepEqual(Object.keys(payload).sort(), ['duration', 'prompt', 'ref_image_0', 'resolution']);
  assert.equal(done.status, 'done');
  assert.equal(done.provider, 'h3_zm_nono');
  assert.ok(done.path.endsWith('.mp4'));
  assert.equal('remoteVideoUrl' in done, false);
  assert.doesNotMatch(await readFile(join(p.path, '.film/wanju-tasks.json'), 'utf8'), /signed\.example\.com|temporary/);
});
test('H3 single-image line polls the original task and retries only download, never generation', async () => {
  const p = await project();
  let submissions = 0;
  let queries = 0;
  let downloads = 0;
  const fetch = async (url) => {
    if (url.includes('/result/')) {
      queries++;
      return Response.json({ code: 'Success', data: { status: 'completed', results: [
        { type: 'video', file_type: 'mp4', output_type: 'output', url: 'https://signed.example.com/output.mp4?token=temporary' },
      ] } });
    }
    submissions++;
    return Response.json({ code: 'Success', data: { status: 'pending', task_id: 'single-002' } });
  };
  const deps = {
    ...dependencies,
    fetch,
    uploadCos: async () => 'https://cos.example.com/first-frame.png',
    download: async () => {
      downloads++;
      if (downloads === 1) throw new Error('temporary download failure');
      return { bytes: Buffer.from('mock-video') };
    },
  };
  const task = await generateOne(p, state, { provider: 'h3_zm_nono', shot: 'S001', confirm: true }, deps);
  assert.equal(task.status, 'queued');
  await assert.rejects(queryH3(p, task.id, deps), /下载或本地检查未完成/);
  const savedAfterFailure = (await generationTasks(p.path))[0];
  assert.equal(savedAfterFailure.remoteId, 'single-002');
  assert.equal(savedAfterFailure.status, 'download-failed');
  assert.equal('remoteVideoUrl' in savedAfterFailure, false);
  assert.doesNotMatch(await readFile(join(p.path, '.film/wanju-tasks.json'), 'utf8'), /signed\.example\.com|temporary/);
  const recovered = await queryH3(p, task.id, deps);
  assert.equal(recovered.status, 'done');
  assert.equal(submissions, 1);
  assert.equal(queries, 2);
  assert.equal(downloads, 2);
});
test('image tasks persist phase timings but summaries expose only numeric diagnostics', async () => {
  const p = await project();
  const task = await generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, {
    ...dependencies,
    fetch: async () => Response.json({ data: [{ b64_json: picture.toString('base64') }] }),
  });
  const summary = taskSummary(task);
  assert.equal(summary.status, 'done');
  assert.ok(summary.timing.providerMs >= 0);
  assert.ok(summary.timing.localWriteMs >= 0);
  assert.ok(summary.timing.probeMs >= 0);
  assert.ok(summary.timing.totalMs >= summary.timing.providerMs);
  assert.doesNotMatch(JSON.stringify(summary), /api_key|secret|prompt|https?:/i);
});
test('status query failures preserve the original task and persist safe diagnostics', async () => {
  const p = await project();
  const deps = { ...dependencies, uploadCos: async () => 'https://example.com/reference.png',
    fetch: async () => Response.json({ data: { task_id: 'remote-002' } }) };
  const task = await generateOne(p, state, { provider: 'h3', shot: 'S001', confirm: true }, deps);
  for (const response of [() => new Response('SAMPLE_SECRET', { status: 503 }),
    () => Response.json({ data: { status: 'SECRET_INVALID_STATUS' } })]) {
    await assert.rejects(queryH3(p, task.id, { ...deps, fetch: async () => response() }));
    const saved = (await generationTasks(p.path))[0];
    assert.equal(saved.remoteId, task.remoteId);
    assert.equal(saved.status, 'queued');
    assert.ok(saved.timing.lastQueryMs >= 0);
    assert.ok(saved.queryError);
    assert.doesNotMatch(JSON.stringify(taskSummary(saved)), /SAMPLE_SECRET|SECRET_INVALID_STATUS/);
  }
  assert.equal((await generationTasks(p.path))[0].timing.queryCount, 2);
});
test('network ambiguity blocks resubmission and never leaks provider errors or credentials', async () => {
  const p = await project();
  let attempts = 0;
  const deps = { ...dependencies, fetch: async () => { attempts++; throw new Error('SAMPLE_SECRET_DO_NOT_EXPOSE'); } };
  await assert.rejects(generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, deps), /结果未知/);
  await assert.rejects(generateOne(p, state, { provider: 'image', shot: 'S001', confirm: true }, deps), /未结束/);
  assert.equal(attempts, 1);
  assert.equal((await generationTasks(p.path))[0].status, 'unknown');
  assert.doesNotMatch(JSON.stringify(await generationTasks(p.path)), /SAMPLE_SECRET/);
});
test('image endpoints honor the configured origin without duplicating /v1 or accepting secret-bearing URLs', () => {
  assert.equal(imageUrl({}, '/v1/images/generations'), 'https://image.xem8k5.top/v1/images/generations');
  for (const base_url of ['https://images.example.com', 'https://images.example.com/v1', 'https://images.example.com/v1/']) {
    assert.equal(imageUrl({ base_url }, '/v1/images/edits'), 'https://images.example.com/v1/images/edits');
  }
  for (const base_url of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://u:secret@example.com',
    'https://example.com?key=secret', 'https://example.com/v1/images/generations']) {
    assert.throws(() => imageUrl({ base_url }, '/v1/images/generations'));
  }
});
test('401 and 403 are explicit refusals, allow an explicit later attempt and never retry automatically', async () => {
  for (const status of [401, 403]) {
    const p = await project();
    let attempts = 0;
    const deps = { ...dependencies, fetch: async () => {
      attempts++;
      return new Response('SAMPLE_SECRET_DO_NOT_EXPOSE', { status });
    } };
    await assert.rejects(generateOne(p, state, { provider: 'image', shot: shot.id, confirm: true }, deps), new RegExp(`HTTP ${status}`));
    assert.equal(attempts, 1);
    assert.equal((await generationTasks(p.path))[0].status, 'rejected');
    const done = await generateOne(p, state, { provider: 'image', shot: shot.id, confirm: true }, {
      ...dependencies,
      config: async () => ({ api_key: 'TEST_REPLACEMENT_KEY', model: 'test-model', base_url: 'https://images.example.com/v1' }),
      fetch: async (url, init) => {
        assert.equal(url, 'https://images.example.com/v1/images/generations');
        assert.equal(init.headers.Authorization, 'Bearer TEST_REPLACEMENT_KEY');
        return Response.json({ data: [{ b64_json: picture.toString('base64') }] });
      },
    });
    assert.equal(done.status, 'done');
    assert.doesNotMatch(JSON.stringify(await generationTasks(p.path)), /SAMPLE_SECRET|TEST_REPLACEMENT_KEY/);
  }
});
test('legacy authorization refusals no longer block a shot, without rewriting its original record', async () => {
  const p = await project();
  const file = join(p.path, '.film/wanju-tasks.json');
  const original = JSON.stringify([
    { id: 'old-refusal', shot: shot.id, provider: 'image', status: 'unknown', error: '服务商返回 HTTP 403，请检查额度和后台记录。' },
    { id: 'network', shot: 'S002', provider: 'image', status: 'unknown', error: '接口连接中断，任务结果未知；请先查服务商后台，不要重复提交。' },
    { id: 'server', shot: 'S003', provider: 'image', status: 'unknown', error: '服务商返回 HTTP 503，请检查额度和后台记录。' },
  ]);
  await writeFile(file, original);
  assert.deepEqual((await generationTasks(p.path)).map((task) => task.status), ['rejected', 'unknown', 'unknown']);
  assert.equal(await readFile(file, 'utf8'), original);
});
