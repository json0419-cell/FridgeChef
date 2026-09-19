import {
  UserFacingError,
  type UserFacingErrorCode,
  type UserFacingErrorParams,
} from '../errors/user-facing-error';
import type { TranslationFunction, TranslationKey } from './i18n';

/**
 * The single boundary where a thrown `UserFacingErrorCode` becomes text in the user's language.
 *
 * The return type is the proof that every code is translated: a code without an `errors.<code>`
 * entry in both dictionaries makes this line fail `tsc`, so no screen can reach a missing key.
 */
function errorTranslationKey(code: UserFacingErrorCode): TranslationKey {
  return `errors.${code}`;
}

export function localizeErrorCode(
  code: UserFacingErrorCode,
  params: UserFacingErrorParams | undefined,
  t: TranslationFunction,
): string {
  return t(errorTranslationKey(code), params);
}

/**
 * Turns anything a screen catches into readable text. Errors that predate this scheme still carry
 * their own prose, so they are passed through rather than hidden behind a generic message.
 */
export function localizeError(error: unknown, t: TranslationFunction): string {
  if (error instanceof UserFacingError) {
    return localizeErrorCode(error.code, error.params, t);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : t('common.unknown');
}
