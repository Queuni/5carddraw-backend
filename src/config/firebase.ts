import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App;

try {
  // Check if Firebase is already initialized
  if (admin.apps.length === 0) {
    const projectRoot = path.resolve(__dirname, '../..');
    const defaultServiceAccountPath = path.resolve(projectRoot, 'firebase-service-account.json');

    // Option 1: Use service account JSON file
    let serviceAccountPath: string | null = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Resolve path - try multiple approaches
      if (path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
        serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      } else {
        serviceAccountPath = path.resolve(projectRoot, process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      }
    } else if (fs.existsSync(defaultServiceAccountPath)) {
      serviceAccountPath = defaultServiceAccountPath;
    }

    if (serviceAccountPath) {
      // Check if file exists
      if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(
          `Firebase service account file not found at: ${serviceAccountPath}\n` +
          `Resolved from: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}\n` +
          `Project root: ${projectRoot}\n` +
          `Current working directory: ${process.cwd()}`
        );
      }

      const serviceAccount = require(serviceAccountPath);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    // Option 2: Use environment variables
    else if (process.env.FIREBASE_PRIVATE_KEY) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        } as admin.ServiceAccount),
      });
    } else {
      throw new Error('Firebase credentials not found. Please set FIREBASE_SERVICE_ACCOUNT_PATH or Firebase environment variables.');
    }
  } else {
    firebaseApp = admin.app();
  }
} catch (error) {
  // Always log Firebase initialization errors (critical)
  console.error('Error initializing Firebase Admin SDK:', error);
  throw error;
}

export const auth = admin.auth();
export const db = admin.firestore();
export { firebaseApp };

