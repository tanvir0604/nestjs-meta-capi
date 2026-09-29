import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetaCapiModule } from 'nestjs-meta-capi';

import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [
    ConfigModule.forRoot(),

    // forRootAsync is the recommended production form: credentials come from
    // config, never from literals in the source tree.
    MetaCapiModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        datasets: {
          primary: {
            datasetId: config.getOrThrow<string>('META_DATASET_ID'),
            accessToken: config.getOrThrow<string>('META_ACCESS_TOKEN'),
          },
        },
        defaultDataset: 'primary',
        delivery: { mode: 'async' as const },
        cookies: { enabled: true },
      }),
    }),
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class AppModule {}
