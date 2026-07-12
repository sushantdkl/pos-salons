export function isUniqueViolation(error) {
  return error?.code === '23505';
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
