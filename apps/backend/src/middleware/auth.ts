import { NextFunction, Request, RequestHandler, Response } from 'express';

import { AuthService, sanitizeUser } from '../services/authService';
import { verifyAuthToken } from '../utils/jwt';

const authService = new AuthService();

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
  };
};

// Narrowed request type for handlers mounted exclusively behind `requireAuth`.
// `requireAuth` always sets `request.auth` before calling `next()`, so any
// handler that only runs after that middleware can rely on `auth` being
// present without a non-null assertion at each call site. Handlers reachable
// from a mixed public/guarded route file (e.g. authRoutes.ts, oauthRoutes.ts)
// must keep using the optional `AuthenticatedRequest` above.
//
// Express's overloads for `router.get/post/...(path, ...handlers)` require
// every handler in the array to accept a Request type that is a supertype
// of the framework's own `Request<P, ...>` (so ANY incoming request can be
// passed to it); a handler parameter requiring `auth` would be a subtype
// instead, which fails that check. So `AuthedRequest` is applied via a
// single local narrowing at the top of the handler body — `const { auth } =
// request as AuthedRequest;` — rather than as the handler's declared
// parameter type.
export type AuthedRequest = Request & {
  auth: {
    userId: string;
  };
};

export const requireAuth = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  const authorizationHeader = request.header('authorization');

  if (!authorizationHeader?.startsWith('Bearer ')) {
    response.status(401).json({ message: 'Missing bearer token.' });
    return;
  }

  try {
    const token = authorizationHeader.replace('Bearer ', '');
    const payload = verifyAuthToken(token);
    const user = await authService.findById(payload.userId);

    if (!user) {
      response.status(401).json({ message: 'Invalid authentication token.' });
      return;
    }

    request.auth = { userId: user.id };
    response.locals.user = sanitizeUser(user);
    next();
  } catch (error: unknown) {
    // Intentionally broad: this trust boundary must return 401 for ANY
    // failure while resolving the bearer token (malformed/expired JWT from
    // verifyAuthToken, or a lookup failure from authService.findById) —
    // narrowing to e.g. only JsonWebTokenError would let an unrelated
    // failure (a DB error) escape to Express's default error handler and
    // change the response from 401 to a 500, which is a behavior change
    // this task must not make.
    void error;
    response.status(401).json({ message: 'Invalid authentication token.' });
  }
};

export const requireLocalAuthEnabled =
  (enabled: boolean, message: string, code: string): RequestHandler =>
  (_request, response, next): void => {
    if (!enabled) {
      response.status(403).json({ message, code });
      return;
    }
    next();
  };
