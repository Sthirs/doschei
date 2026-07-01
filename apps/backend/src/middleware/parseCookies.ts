import { type NextFunction, type Request, type Response } from 'express';

export function parseCookies(req: Request, _res: Response, next: NextFunction): void {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    next();
    return;
  }
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      cookies[pair.substring(0, idx).trim()] = pair.substring(idx + 1).trim();
    }
  }
  (req as Request & { cookies: Record<string, string> }).cookies = cookies;
  next();
}
