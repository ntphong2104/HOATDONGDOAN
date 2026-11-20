import {
  runWithConcurrency,
  runSerializedByKey,
  QueueTimeoutError,
} from '@/lib/utils/concurrency-queue';

describe('concurrency-queue', () => {
  test('caps simultaneous active executions to maxConcurrent under burst load', async () => {
    let active = 0;
    let peakActive = 0;
    const results: number[] = [];

    const tasks = Array.from({ length: 40 }, (_, i) =>
      runWithConcurrency('test_burst', 5, async () => {
        active++;
        if (active > peakActive) peakActive = active;
        await new Promise((r) => setTimeout(r, 8));
        results.push(i);
        active--;
        return i;
      })
    );

    const resolved = await Promise.all(tasks);
    expect(resolved).toHaveLength(40);
    expect(results).toHaveLength(40);
    expect(peakActive).toBeLessThanOrEqual(5);
    expect(active).toBe(0);
  });

  test('rejects with QueueTimeoutError when waiting exceeds waitTimeoutMs', async () => {
    const blocker = runWithConcurrency('test_timeout', 1, async () => {
      await new Promise((r) => setTimeout(r, 80));
      return 'done';
    });

    await expect(
      runWithConcurrency(
        'test_timeout',
        1,
        async () => 'should_not_run',
        15
      )
    ).rejects.toBeInstanceOf(QueueTimeoutError);

    expect(await blocker).toBe('done');
  });

  test('runSerializedByKey prevents lost-update race conditions on shared key', async () => {
    let sharedCounter = 0;

    await Promise.all(
      Array.from({ length: 25 }, () =>
        runSerializedByKey('event_regs_test_1', async () => {
          const snapshot = sharedCounter;
          await new Promise((r) => setTimeout(r, 2));
          sharedCounter = snapshot + 1;
        })
      )
    );

    expect(sharedCounter).toBe(25);
  });
});
