import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_BUCKET ?? 'exchange';

@Injectable()
export class HealthService {
    private readonly supabase = createClient(
        process.env.SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        { auth: { persistSession: false } },
    );

    async checkSupabaseStorage(): Promise<void> {
        // Vérifie env (fail fast)
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }

        // Ping Supabase Storage (léger, ne liste pas les fichiers)
        const { data, error } = await this.supabase.storage.getBucket(BUCKET);

        if (error || !data) {
            const msg = error?.message ?? 'Supabase storage check failed';
            throw new Error(msg);
        }
    }
}