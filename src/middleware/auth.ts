import 'dotenv/config';
import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import crypto from 'crypto';

export interface AuthUserPayload {
  uid: string;
  email: string;
  username?: string;
  emailVerified?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}

const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
const isProductionRuntime =
  process.env.NODE_ENV === 'production' ||
  process.env.npm_lifecycle_event === 'start' ||
  process.cwd().startsWith('/srv');
const sessionSecretIsStrong =
  Boolean(configuredSessionSecret) &&
  configuredSessionSecret!.length >= 32 &&
  configuredSessionSecret !== 'campusodds-inapp-webview-secret-2026';

if (isProductionRuntime && !sessionSecretIsStrong) {
  throw new Error(
    'SESSION_SECRET must be configured with at least 32 characters before production authentication can start.'
  );
}

// Local development gets a per-process secret rather than a source-visible default.
// It intentionally invalidates local sessions after a server restart.
const SESSION_SECRET = sessionSecretIsStrong
  ? configuredSessionSecret!
  : crypto.randomBytes(32).toString('base64url');

export function createInAppToken(payload: AuthUserPayload): string {
  if (!payload.uid || !payload.email) {
    throw new Error('An authenticated user ID and email are required.');
  }
  const data = Buffer.from(
    JSON.stringify({
      uid: payload.uid,
      email: payload.email,
      username: payload.username,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `inapp.${data}.${sig}`;
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.toString('base64url') === value ? decoded : null;
}

export function verifyInAppToken(token: string): AuthUserPayload | null {
  if (!token.startsWith('inapp.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, data, sig] = parts;
  const dataBytes = decodeCanonicalBase64Url(data);
  const suppliedBytes = decodeCanonicalBase64Url(sig);
  if (!dataBytes || !suppliedBytes) return null;

  const expectedBytes = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest();
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(dataBytes.toString('utf-8')) as Partial<AuthUserPayload>;
    if (
      typeof payload.uid !== 'string' ||
      !payload.uid ||
      typeof payload.email !== 'string' ||
      !payload.email
    ) {
      return null;
    }
    return {
      uid: payload.uid,
      email: payload.email,
      username: typeof payload.username === 'string' ? payload.username : undefined,
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

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const inAppUser = verifyInAppToken(token);
  if (inAppUser) {
    req.user = inAppUser;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken.email || decodedToken.email_verified !== true) {
      return res.status(401).json({ error: 'Unauthorized: Verified email required' });
    }
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      username: decodedToken.name,
      emailVerified: decodedToken.email_verified,
    };
    return next();
  } catch {
    // Expired or invalid Firebase tokens must be refreshed or reauthenticated;
    // their decoded payload is never accepted without cryptographic verification.
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};
