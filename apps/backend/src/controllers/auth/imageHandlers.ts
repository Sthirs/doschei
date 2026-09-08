import { Response } from 'express';

import { AuthedRequest, AuthenticatedRequest } from '../../middleware/auth';
import { sanitizeUser } from '../../services/authService';
import {
  normalizeToDataUrl,
  UnsupportedImageTypeError,
} from '../../services/imageService';
import { authService } from './authServiceInstance';

/**
 * POST /api/auth/me/image — upload an avatar image for the authenticated user.
 *
 * The multer middleware (uploadSingleImage) handles:
 *   - 413 Payload Too Large when file exceeds MAX_UPLOAD_BYTES
 *   - 415 Unsupported Media Type when MIME type is not in ALLOWED_MIME_TYPES
 *
 * This handler maps:
 *   - missing file → 400
 *   - sharp decode error → 422
 *   - UnsupportedImageTypeError (defense in depth) → 415
 */
export const updateImage = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  if (!request.file) {
    response.status(400).json({ message: 'Image file is required.' });
    return;
  }

  try {
    const dataUrl = await normalizeToDataUrl(
      request.file.buffer,
      request.file.mimetype,
    );

    const user = await authService.updateImage(auth.userId, dataUrl);
    response.json({ user: sanitizeUser(user) });
  } catch (error: unknown) {
    if (error instanceof UnsupportedImageTypeError) {
      response.status(415).json({ message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      error.name === 'Error' &&
      error.message.includes('Input buffer contains unsupported image format')
    ) {
      response.status(422).json({ message: 'Invalid image file.' });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to upload image.',
    });
  }
};

/**
 * DELETE /api/auth/me/image — remove the authenticated user's avatar image.
 */
export const deleteImage = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  try {
    const user = await authService.deleteImage(auth.userId);
    response.json({ user: sanitizeUser(user) });
  } catch (error: unknown) {
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to delete image.',
    });
  }
};
