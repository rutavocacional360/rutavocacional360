import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

/** Security headers only: authorization remains in the backend. */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // PDF.js reads the report generated in this browser through its blob URL.
    `connect-src 'self' blob:${dev ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    // External course videos use only YouTube's privacy-enhanced embed origin.
    "frame-src 'self' blob: https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_URL?.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({request:{headers}});
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|assets/|media/|icons/|data/|vendor/).*)'],
};
