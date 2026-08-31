import { ref, type Ref } from 'vue';

/**
 * Localized strings consumed by the upload flow. Same boundary as
 * `useExpenseSplit`: the composable owns the logic, the caller owns the
 * strings. Each message is a getter rather than a plain string so it resolves
 * against the locale active when the error actually happens — the account
 * screen can switch language while mounted.
 */
export type ImageUploadMessages = {
  invalidType: () => string;
  tooLarge: () => string;
  uploadFailed: () => string;
};

export type UseImageUploadReturn = {
  isUploading: Ref<boolean>;
  uploadError: Ref<string>;
  handleFileChange: (event: Event) => Promise<void>;
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Shared state machine behind every "pick an image file" control: validates the
 * chosen file client-side, clears the input so re-picking the same file still
 * fires `change`, and tracks in-flight/error state around the caller's upload.
 */
export const useImageUpload = (
  upload: (file: File) => Promise<unknown>,
  messages: ImageUploadMessages,
): UseImageUploadReturn => {
  const isUploading = ref(false);
  const uploadError = ref('');

  const validate = (file: File): string | null => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return messages.invalidType();
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return messages.tooLarge();
    }
    return null;
  };

  const handleFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadError.value = '';
    input.value = '';

    const validationError = validate(file);
    if (validationError) {
      uploadError.value = validationError;
      return;
    }

    isUploading.value = true;
    try {
      await upload(file);
    } catch {
      uploadError.value = messages.uploadFailed();
    } finally {
      isUploading.value = false;
    }
  };

  return { isUploading, uploadError, handleFileChange };
};
