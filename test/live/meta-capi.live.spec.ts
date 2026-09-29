import { Test } from '@nestjs/testing';

import { MetaCapiModule } from '../../src/meta-capi.module';
import { MetaCapiService } from '../../src/services/meta-capi.service';

/**
 * Live delivery test — hits the real Meta Conversions API.
 *
 * Opt-in only: it is skipped unless `META_LIVE_TEST=true` **and** credentials
 * are present, and it is excluded from the default `test` run entirely
 * (`testPathIgnorePatterns` in `jest.config.cjs`). Never executed on pull
 * requests (SPEC.md §12).
 *
 * ```bash
 * META_LIVE_TEST=true \
 * META_LIVE_DATASET_ID=... \
 * META_LIVE_ACCESS_TOKEN=... \
 * META_LIVE_TEST_EVENT_CODE=TEST123 \  # optional but recommended
 * npm run test:live
 * ```
 */
const config = {
  enabled: process.env.META_LIVE_TEST === 'true',
  datasetId: process.env.META_LIVE_DATASET_ID ?? '',
  accessToken: process.env.META_LIVE_ACCESS_TOKEN ?? '',
  testEventCode: process.env.META_LIVE_TEST_EVENT_CODE,
};

const describeLive =
  config.enabled && config.datasetId !== '' && config.accessToken !== '' ? describe : describe.skip;

describeLive('live Meta CAPI delivery (SPEC.md §12)', () => {
  it('delivers an event to the real Conversions API', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaCapiModule.forRoot({
          datasets: {
            live: {
              datasetId: config.datasetId,
              accessToken: config.accessToken,
              ...(config.testEventCode !== undefined
                ? { testEventCode: config.testEventCode }
                : {}),
            },
          },
          delivery: { mode: 'sync' },
        }),
      ],
    }).compile();

    const service = moduleRef.get(MetaCapiService);

    await expect(
      service.track({ eventName: 'Lead', eventId: `live-${Date.now()}` }),
    ).resolves.toBeUndefined();

    await moduleRef.close();
  }, 30_000);
});
