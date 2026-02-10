import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

type StoredFileMeta = {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  uploadedAt: number;
};

type FileData = {
  file?: StoredFileMeta;
  validated?: boolean;
};

type SessionData = {
  users: Record<string, FileData>;
};

type DailyUsage = {
  count: number;
  bytes: number;
};

const BUCKET = process.env.SUPABASE_BUCKET ?? 'exchange';
const MAX_UPLOADS_PER_DAY = Number(process.env.MAX_UPLOADS_PER_DAY ?? 15);
const MAX_MB_PER_DAY = Number(process.env.MAX_MB_PER_DAY ?? 200);
const MAX_BYTES_PER_DAY = MAX_MB_PER_DAY * 1024 * 1024;

@Injectable()
export class ExchangeService {
  private readonly sessions = new Map<string, SessionData>();
  private readonly dailyUsage = new Map<string, DailyUsage>();
  private readonly supabase: ReturnType<typeof createClient>;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
      );
    }

    this.supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  private todayKey(userId: string): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}:${userId}`;
  }

  private enforceDailyLimits(userId: string, sizeBytes: number): void {
    const key = this.todayKey(userId);
    const usage = this.dailyUsage.get(key) ?? { count: 0, bytes: 0 };

    if (usage.count + 1 > MAX_UPLOADS_PER_DAY) {
      throw new HttpException(
        `Daily upload limit reached (${MAX_UPLOADS_PER_DAY}/day)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (usage.bytes + sizeBytes > MAX_BYTES_PER_DAY) {
      throw new HttpException(
        `Daily bandwidth limit reached (${MAX_MB_PER_DAY}MB/day)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    usage.count += 1;
    usage.bytes += sizeBytes;
    this.dailyUsage.set(key, usage);
  }

  private getOrCreateSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId) ?? { users: {} };
    this.sessions.set(sessionId, session);
    return session;
  }

  private getPeerId(sessionId: string, userId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const peerIds = Object.keys(session.users).filter((id) => id !== userId);
    return peerIds.length > 0 ? peerIds[0] : null;
  }

  private safeFileName(name: string): string {
    return name.replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
  }

  private buildPath(sessionId: string, userId: string, originalname: string) {
    const stamp = Date.now();
    const safe = this.safeFileName(originalname);
    return `exchange/${sessionId}/${userId}/${stamp}-${safe}`;
  }

  private throwStorageError(prefix: string, error: unknown): never {
    throw new HttpException(
      `${prefix}: ${this.getErrorMessage(error)}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return 'Unknown error';
  }

  async uploadFile(
    sessionId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<void> {
    this.enforceDailyLimits(userId, file.size);

    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] ?? {};

    const previousPath = session.users[userId].file?.path;
    if (previousPath) {
      const { error } = await this.supabase.storage
        .from(BUCKET)
        .remove([previousPath]);

      if (error) this.throwStorageError('Supabase remove failed', error);
    }

    const path = this.buildPath(sessionId, userId, file.originalname);

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (error) this.throwStorageError('Supabase upload failed', error);

    session.users[userId].file = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path,
      uploadedAt: Date.now(),
    };

    session.users[userId].validated = false;
  }

  getStatus(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;

    const me = session.users[userId];
    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;

    return {
      me: { uploaded: Boolean(me.file), validated: Boolean(me.validated) },
      peer: peer
        ? { uploaded: Boolean(peer.file), validated: Boolean(peer.validated) }
        : null,
    };
  }

  getPreview(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;
    const meta = peer?.file;
    if (!meta) return null;

    return {
      originalname: meta.originalname,
      size: meta.size,
      mimetype: meta.mimetype,
    };
  }

  validate(sessionId: string, userId: string) {
    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] ?? {};
    session.users[userId].validated = true;
    return true;
  }

  canDownload(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;

    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return false;

    const me = session.users[userId];
    const peer = session.users[peerId];

    return Boolean(me.validated && me.file && peer.validated && peer.file);
  }

  async getPeerFileDownload(
    sessionId: string,
    userId: string,
  ): Promise<{
    originalname: string;
    mimetype: string;
    bytes: Uint8Array;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;

    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return null;

    const meta = session.users[peerId]?.file;
    if (!meta) return null;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(meta.path, 60);

    if (error) this.throwStorageError('Supabase signed URL failed', error);
    if (!data?.signedUrl) {
      throw new HttpException(
        'Supabase signed URL missing',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const resp = await fetch(data.signedUrl);
    if (!resp.ok) {
      throw new HttpException(
        `Download failed with status ${resp.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await resp.arrayBuffer();

    return {
      originalname: meta.originalname,
      mimetype: meta.mimetype,
      bytes: new Uint8Array(arrayBuffer),
    };
  }

  async resetSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;

    const paths: string[] = [];
    for (const u of Object.keys(session.users)) {
      const p = session.users[u]?.file?.path;
      if (p) paths.push(p);
    }

    if (paths.length > 0) {
      const { error } = await this.supabase.storage.from(BUCKET).remove(paths);
      if (error) this.throwStorageError('Supabase remove failed', error);
    }

    this.sessions.delete(sessionId);
    return true;
  }
}
