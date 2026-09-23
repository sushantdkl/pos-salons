export function isMissingRelationError(error, relationName = '') {
  if (error?.code !== '42P01') return false;
  if (!relationName) return true;
  return String(error?.message || '').includes(`"${relationName}"`) || String(error?.message || '').includes(relationName);
}

export function mapApiError(error, fallbackMessage = 'Unable to complete the request.') {
  if (isMissingRelationError(error, 'savings_deposits')) {
    return {
      status: 503,
      code: 'SAVINGS_SCHEMA_MISSING',
      message: 'Savings setup is pending. Please run the savings database migration, then restart the app.',
    };
  }

  return {
    status: error?.status || 500,
    code: error?.code || 'UNEXPECTED_ERROR',
    message: error?.status && error?.message ? error.message : fallbackMessage,
  };
}

