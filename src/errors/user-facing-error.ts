/**
 * The error shape for failures a user reads.
 *
 * Low-level modules (pack download, manifest validation, Local Retrieval) run far from the
 * I18nProvider and must not depend on it, so they cannot know which language the user reads. They
 * throw a stable `code` plus interpolation `params` instead of prose, and the UI boundary turns
 * that into an `errors.<code>` translation. `message` stays English on purpose: it is what lands in
 * logs and Diagnostic Information, where one fixed language is easier to search than a localized one.
 *
 * This generalizes the per-module pattern of `ApiKeyMigrationError` and `RecommendationRefinerError`;
 * both keep their own classes because their codes drive UI branching beyond message lookup.
 */

export type UserFacingErrorParams = Record<string, string | number>;

/**
 * Every code a user can be shown, grouped by the area that throws it.
 *
 * The union is central so one compile-time check at the UI boundary proves each code has a
 * translation: a code added here without an `errors.<code>` entry fails `tsc`.
 */
export type UserFacingErrorCode =
  // Pack manifest file-list validation, shared by Official DatasetPacks and embedding model packs.
  | 'PACK_FILES_MISSING'
  | 'PACK_FILE_COUNT_EXCEEDED'
  | 'PACK_FILE_ENTRY_INVALID'
  | 'PACK_FILE_ROLE_MISSING'
  | 'PACK_FILE_PATH_MISSING'
  | 'PACK_FILE_PATH_DUPLICATE'
  | 'PACK_FILE_SIZE_INVALID'
  | 'PACK_FILE_SIZE_EXCEEDED'
  | 'PACK_FILE_URL_INVALID'
  | 'PACK_TOTAL_SIZE_EXCEEDED'
  | 'PACK_REQUIRED_ROLES_MISSING'
  | 'PACK_FILE_PATH_EMPTY'
  | 'PACK_FILE_PATH_UNSAFE'
  | 'PACK_FILE_PATH_NOT_RELATIVE'
  | 'PACK_URL_INVALID'
  | 'PACK_URL_NOT_SECURE'
  | 'PACK_FILE_SHA256_MISSING'
  | 'PACK_FILE_SHA256_MISMATCH'
  | 'PACK_JSON_PARSE_FAILED'
  // Resumable HTTP transfer and streaming verification.
  | 'DOWNLOAD_RANGE_PARAMS_INVALID'
  | 'DOWNLOAD_RESUME_UNSUPPORTED'
  | 'DOWNLOAD_CHUNK_FAILED'
  | 'DOWNLOAD_CONTENT_RANGE_INVALID'
  | 'SHA256_STREAM_PARAMS_INVALID'
  | 'SHA256_STREAM_TRUNCATED'
  // Embedding model pack: manifest, download, storage, and memory budget.
  | 'MODEL_MANIFEST_INVALID'
  | 'MODEL_MANIFEST_SCHEMA_UNSUPPORTED'
  | 'MODEL_MANIFEST_IDENTITY_MISSING'
  | 'MODEL_MANIFEST_MODEL_MISSING'
  | 'MODEL_MANIFEST_QUERY_EMBEDDING_MISSING'
  | 'MODEL_MANIFEST_DOWNLOAD_FAILED'
  | 'MODEL_MANIFEST_TOO_LARGE'
  | 'MODEL_MANIFEST_DOWNLOAD_TIMEOUT'
  | 'MODEL_FILE_DOWNLOAD_FAILED'
  | 'MODEL_FILE_SIZE_MISMATCH'
  | 'MODEL_FILE_SHA256_MISMATCH'
  | 'MODEL_FILE_RESUME_UNSUPPORTED'
  | 'MODEL_FILE_SIZE_MANIFEST_MISMATCH'
  | 'MODEL_WRITE_OUTSIDE_ROOT'
  | 'MODEL_DELETE_OUTSIDE_ROOT'
  | 'MODEL_STORAGE_INSUFFICIENT'
  | 'MODEL_SIZE_INVALID'
  | 'MODEL_MEMORY_INSUFFICIENT'
  // Official DatasetPack: index, manifest, download, storage.
  | 'DATASET_INDEX_DOWNLOAD_FAILED'
  | 'DATASET_INDEX_SCHEMA_UNSUPPORTED'
  | 'DATASET_INDEX_ENTRIES_MISSING'
  | 'DATASET_INDEX_ENTRY_INVALID'
  | 'DATASET_MANIFEST_INVALID'
  | 'DATASET_MANIFEST_SCHEMA_UNSUPPORTED'
  | 'DATASET_MANIFEST_IDENTITY_MISSING'
  | 'DATASET_MANIFEST_RECIPE_COUNT_INVALID'
  | 'DATASET_MANIFEST_CHUNK_COUNT_INVALID'
  | 'DATASET_MANIFEST_EMBEDDING_MISSING'
  | 'DATASET_MANIFEST_FLOAT32_EMBEDDING_MISSING'
  | 'DATASET_MANIFEST_DOWNLOAD_FAILED'
  | 'DATASET_MANIFEST_TOO_LARGE'
  | 'DATASET_FILE_EXCEEDS_DECLARED_SIZE'
  | 'DATASET_FILE_SIZE_MISMATCH'
  | 'DATASET_WRITE_OUTSIDE_ROOT'
  | 'DATASET_DELETE_OUTSIDE_ROOT'
  | 'DATASET_TEMP_DELETE_OUTSIDE_ROOT'
  | 'DATASET_STORAGE_INSUFFICIENT'
  // Local Retrieval runtime: embedder and vector store.
  | 'EMBEDDING_MODEL_NOT_LOADED'
  | 'EMBEDDING_TOKENIZER_INPUT_MISSING'
  | 'EMBEDDING_OUTPUT_MISSING'
  | 'EMBEDDING_OUTPUT_TYPE_UNSUPPORTED'
  | 'EMBEDDING_OUTPUT_SHAPE_UNSUPPORTED'
  | 'MODEL_PACK_FILE_MISSING'
  | 'MODEL_PACK_FILE_PATH_EMPTY'
  | 'VECTOR_STORE_NOT_LOADED'
  | 'VECTOR_QUERY_DIMENSION_MISMATCH'
  | 'VECTOR_STORE_DTYPE_UNSUPPORTED'
  | 'VECTOR_FILE_LENGTH_MISMATCH'
  | 'DATASET_PACK_FILE_MISSING'
  | 'DATASET_PACK_FILE_PATH_EMPTY'
  // Embedding model tokenizer pack and on-device hashing.
  | 'FILE_HASH_FAILED'
  | 'TOKENIZER_NOT_UNIGRAM'
  | 'TOKENIZER_UNK_ID_MISSING'
  | 'TOKENIZER_VOCAB_MISSING'
  | 'TOKENIZER_VOCAB_ENTRY_INVALID'
  | 'TOKENIZER_PRE_TOKENIZER_UNEXPECTED'
  | 'TOKENIZER_NORMALIZER_UNEXPECTED'
  | 'TOKENIZER_POST_PROCESSOR_UNEXPECTED'
  | 'TOKENIZER_CHARSMAP_MISSING'
  | 'TOKENIZER_CHARSMAP_BASE64_INVALID'
  | 'TOKENIZER_CHARSMAP_INCOMPLETE'
  | 'TOKENIZER_CHARSMAP_TRIE_INVALID'
  | 'TOKENIZER_VOCAB_SCORES_MISMATCH'
  | 'TOKENIZER_MAX_LENGTH_INVALID'
  | 'TOKENIZER_SPECIAL_TOKENS_MISSING'
  // Credentials and consent.
  | 'API_KEY_EMPTY'
  | 'AI_DATA_CONSENT_REQUIRED';

export class UserFacingError extends Error {
  readonly code: UserFacingErrorCode;
  readonly params: UserFacingErrorParams;

  constructor(
    code: UserFacingErrorCode,
    message: string,
    params: UserFacingErrorParams = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UserFacingError';
    this.code = code;
    this.params = params;
  }
}

export function hasUserFacingErrorCode(error: unknown, codes: readonly UserFacingErrorCode[]): boolean {
  return error instanceof UserFacingError && codes.includes(error.code);
}
