import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from '../src/downloads/single-flight.ts';

test('repeated taps join the running download instead of starting a second one', async () => {
  const run = createSingleFlight<string>();
  let starts = 0;
  let release: (value: string) => void = () => {};
  const task = () => {
    starts += 1;
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  };

  const first = run('pack', task);
  const second = run('pack', task);
  assert.equal(starts, 1);
  assert.equal(run.isRunning('pack'), true);

  release('installed');
  assert.deepEqual(await Promise.all([first, second]), ['installed', 'installed']);
  assert.equal(run.isRunning('pack'), false);
});

test('a failed download is reported to every caller and does not block a retry', async () => {
  const run = createSingleFlight<string>();
  let attempts = 0;
  const failing = () => {
    attempts += 1;
    return Promise.reject(new Error('模型文件大小不匹配：files/tokenizer.onnx'));
  };

  const first = run('pack', failing);
  const second = run('pack', failing);
  await assert.rejects(first, /大小不匹配/);
  await assert.rejects(second, /大小不匹配/);
  assert.equal(attempts, 1);
  assert.equal(run.isRunning('pack'), false);

  await assert.rejects(run('pack', failing), /大小不匹配/);
  assert.equal(attempts, 2);
});

test('different packs still download independently', async () => {
  const run = createSingleFlight<string>();
  const started: string[] = [];
  const task = (key: string) => () => {
    started.push(key);
    return Promise.resolve(key);
  };

  assert.deepEqual(await Promise.all([run('a', task('a')), run('b', task('b'))]), ['a', 'b']);
  assert.deepEqual(started, ['a', 'b']);
});

test('a synchronous throw inside the task rejects instead of escaping', async () => {
  const run = createSingleFlight<string>();
  await assert.rejects(
    run('pack', () => {
      throw new Error('拒绝写入 Model 目录之外的路径');
    }),
    /拒绝写入/,
  );
  assert.equal(run.isRunning('pack'), false);
});
