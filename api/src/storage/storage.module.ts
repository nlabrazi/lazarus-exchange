import { Module } from '@nestjs/common';
import { LocalStorageDriver } from './local-storage.driver';
import { STORAGE_DRIVER } from './storage-driver.interface';
import { SupabaseStorageDriver } from './supabase-storage.driver';

@Module({
  providers: [
    LocalStorageDriver,
    {
      provide: STORAGE_DRIVER,
      useFactory: () => {
        const driverName = (process.env.STORAGE_DRIVER ?? '')
          .trim()
          .toLowerCase();
        const hasSupabaseEnv =
          Boolean(process.env.SUPABASE_URL) &&
          Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

        if (driverName === 'local' || !hasSupabaseEnv) {
          return new LocalStorageDriver();
        }

        return new SupabaseStorageDriver();
      },
    },
  ],
  exports: [STORAGE_DRIVER, LocalStorageDriver],
})
export class StorageModule {}
