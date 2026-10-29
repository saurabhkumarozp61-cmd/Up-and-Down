import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
