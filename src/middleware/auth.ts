import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function loadFirebaseConfig(): { projectId?: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    const urlPath = new URL('../../firebase-applet-config.json', import.meta.url);
    return JSON.parse(fs.readFileSync(urlPath, 'utf8'));
  } catch {
    return {};
  }
}

const firebaseConfig = loadFirebaseConfig();

export interface AuthUserPayload {
  uid: string;
  email: string;
  username?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'campusodds-inapp-webview-secret-2026';

export function createInAppToken(payload: AuthUserPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `inapp.${data}.${sig}`;
}

export function verifyInAppToken(token: string): AuthUserPayload | null {
  if (!token.startsWith('inapp.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, data, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as AuthUserPayload;
  } catch {
    return null;
  }
}

function decodeExpiredFirebaseJwt(token: string): AuthUserPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    const uid = payload.user_id || payload.sub;
    if (!uid) return null;
    if (firebaseConfig.projectId && payload.aud && payload.aud !== firebaseConfig.projectId) {
      return null;
    }
    return {
      uid: String(uid),
      email: payload.email ? String(payload.email) : `${uid}@campusodds.in`,
      username: payload.name ? String(payload.name) : undefined,
    };
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // 1. Check In-App Browser Email/Password, Telegram, or Upgraded session token
  const inAppUser = verifyInAppToken(token);
  if (inAppUser) {
    req.user = inAppUser;
    return next();
  }

  // 2. Verify Firebase ID Token (with seamless recovery if the cached 1-hour Firebase JWT expired)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || `${decodedToken.uid}@campusodds.in`,
      username: decodedToken.name,
    };
    return next();
  } catch (error: any) {
    if (error?.code === 'auth/id-token-expired' || String(error?.message || '').includes('id-token-expired')) {
      const recoveredUser = decodeExpiredFirebaseJwt(token);
      if (recoveredUser) {
        req.user = recoveredUser;
        return next();
      }
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

