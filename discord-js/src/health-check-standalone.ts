#!/usr/bin/env node
/**
 * Standalone health check script for Docker HEALTHCHECK
 * This script checks if the health endpoint is responding
 */

import http from 'http';

const HEALTH_CHECK_PORT = process.env.HEALTH_CHECK_PORT || '3000';
const HEALTH_CHECK_HOST = process.env.HEALTH_CHECK_HOST || 'localhost';
const TIMEOUT = 15000; // 15 seconds timeout - more generous

function checkHealth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HEALTH_CHECK_HOST,
      port: HEALTH_CHECK_PORT,
      path: '/health',
      method: 'GET',
      timeout: TIMEOUT,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('Health check passed:', data.substring(0, 100));
          resolve();
        } else {
          console.error(`Health check failed with status: ${res.statusCode}, response: ${data.substring(0, 200)}`);
          reject(new Error(`Health check failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Health check request failed:', error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error('Health check timed out');
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

// Run health check
checkHealth()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Health check failed:', error.message);
    process.exit(1);
  });