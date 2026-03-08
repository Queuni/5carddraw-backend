import * as fs from 'fs';
import * as path from 'path';

/**
 * Get the application version from package.json
 * Falls back to environment variable or 'unknown' if not found
 */
export function getVersion(): string {
  // First, check environment variable (useful for Docker/CI/CD)
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }

  try {
    // Read package.json from project root
    // __dirname in compiled JS will be dist/utils, so go up two levels
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    
    // Check if package.json exists
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || 'unknown';
    }
  } catch (error) {
    // If reading fails, log in development but don't throw
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Version] Failed to read version from package.json:', error);
    }
  }

  return 'unknown';
}

/**
 * Get version info object with additional metadata
 */
export function getVersionInfo() {
  return {
    version: getVersion(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}

