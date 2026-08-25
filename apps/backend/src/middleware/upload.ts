import multer from 'multer';

import { MAX_UPLOAD_BYTES, assertAllowedMimeType } from '../services/imageService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter: (_request, file, callback) => {
    try {
      assertAllowedMimeType(file.mimetype);
      callback(null, true);
    } catch (error) {
      callback(error instanceof Error ? error : new Error('Invalid file type'));
    }
  },
});

export const uploadSingleImage = upload.single('image');
