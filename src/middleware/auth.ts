import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import crypto from 'crypto';

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

  // 1. Check In-App Browser Email/Password or Telegram session token
  const inAppUser = verifyInAppToken(token);
  if (inAppUser) {
    req.user = inAppUser;
    return next();
  }

  // 2. Verify Firebase ID Token
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || `${decodedToken.uid}@campusodds.in`,
      username: decodedToken.name,
    };
    return next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
