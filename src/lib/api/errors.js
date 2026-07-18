export function isUniqueViolation(error) {
  const code = error?.code || error?.cause?.code;
  const message = String(error?.message || error?.cause?.message || '');
  return code === '23505' || /duplicate key|unique constraint/i.test(message);
}

export function isDatabaseNoise(message) {
  return /duplicate key|unique constraint|violates|null value in column|relation |syntax error|ECONNREFUSED|password authentication|column .* does not exist/i.test(
    String(message || '')
  );
}

export function publicErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || '';
  if (error?.status === 401 || /unauthorized/i.test(message)) {
    return 'Your session has expired. Please sign in again.';
  }
  if (!message || isDatabaseNoise(message)) return fallback;
  if (error?.status && error.status < 500) return message;
  if (/cannot be deleted|already registered|valid phone|PIN must|required|Access denied/i.test(message)
    && !isDatabaseNoise(message)) {
    return message;
  }
  return fallback;
}

export function conflictResponse(message, code) {
  return Response.json({ success: false, code, message, error: message }, { status: 409 });
}

export function validationResponse(message, code = 'VALIDATION_ERROR') {
  return Response.json({ success: false, code, message, error: message }, { status: 400 });
}

export function businessRuleResponse(message, code = 'BUSINESS_RULE_ERROR') {
  return Response.json({ success: false, code, message, error: message }, { status: 422 });
}

export function unexpectedResponse(message = 'Something went wrong. Please try again.') {
  return Response.json({ success: false, code: 'UNEXPECTED_ERROR', message, error: message }, { status: 500 });
}
