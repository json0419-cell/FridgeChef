import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from '../src/downloads/single-flight.ts';
import { UserFacingError } from '../src/errors/user-facing-error.ts';

async function rejectsCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof UserFacingError);
    assert.equal(error.code, code);
    return true;
  });
}

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
    return Promise.reject(
      new UserFacingError('MODEL_FILE_SIZE_MISMATCH', 'The model file size does not match: files/tokenizer.onnx', {
        path: 'files/tokenizer.onnx',
      }),
    );
  };

  const first = run('pack', failing);
  const second = run('pack', failing);
  await rejectsCode(() => first, 'MODEL_FILE_SIZE_MISMATCH');
  await rejectsCode(() => second, 'MODEL_FILE_SIZE_MISMATCH');
  assert.equal(attempts, 1);
  assert.equal(run.isRunning('pack'), false);

  await rejectsCode(() => run('pack', failing), 'MODEL_FILE_SIZE_MISMATCH');
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
  await rejectsCode(
    () =>
      run('pack', () => {
        throw new UserFacingError('MODEL_WRITE_OUTSIDE_ROOT', 'Refused to write outside the model directory: ../evil', {
          path: '../evil',
        });
      }),
    'MODEL_WRITE_OUTSIDE_ROOT',
  );
  assert.equal(run.isRunning('pack'), false);
});
