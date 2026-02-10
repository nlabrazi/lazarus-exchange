import { Injectable } from '@nestjs/common';
import { Express } from 'express';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

type FileData = {
  file?: UploadedFile;
  validated?: boolean;
};

type SessionData = {
  users: {
    [userId: string]: FileData;
  };
};

@Injectable()
export class ExchangeService {
  private sessions: Map<string, SessionData> = new Map();

  private getOrCreateSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId) || { users: {} };
    this.sessions.set(sessionId, session);
    return session;
  }

  private getPeerId(sessionId: string, userId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const peerIds = Object.keys(session.users).filter((id) => id !== userId);
    return peerIds.length > 0 ? peerIds[0] : null;
  }

  uploadFile(sessionId: string, userId: string, file: UploadedFile) {
    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] || {};
    session.users[userId].file = file;
  }

  getStatus(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;

    const me = session.users[userId];
    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;

    return {
      me: {
        uploaded: !!me.file,
        validated: !!me.validated,
      },
      peer: peer
        ? {
          uploaded: !!peer.file,
          validated: !!peer.validated,
        }
        : null,
    };
  }

  getPreview(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const peerId = this.getPeerId(sessionId, userId);
    const peer = peerId ? session.users[peerId] : null;
    if (!peer?.file) return null;

    return {
      originalname: peer.file.originalname,
      size: peer.file.size,
      mimetype: peer.file.mimetype,
    };
  }

  validate(sessionId: string, userId: string) {
    const session = this.getOrCreateSession(sessionId);
    session.users[userId] = session.users[userId] || {};
    session.users[userId].validated = true;
    return true;
  }

  canDownload(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;
    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return false;

    return (
      session.users[userId]?.validated &&
      session.users[userId]?.file &&
      session.users[peerId]?.validated &&
      session.users[peerId]?.file
    );
  }

  getPeerFile(sessionId: string, userId: string): UploadedFile | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return null;
    const peerId = this.getPeerId(sessionId, userId);
    if (!peerId) return null;
    return session.users[peerId]?.file || null;
  }

  resetSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.users[userId]) return false;
    this.sessions.delete(sessionId);
    return true;
  }
}
