/**
 * μ's Song Database API
 * ApiResponse.gs
 * JSON / JSONP 共通レスポンス処理
 */

function buildSuccessPayload_(data) {
  return {
    success: true,
    apiVersion: '1.0.0',
    generatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Tokyo',
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    ),
    data: data,
  };
}

function buildErrorPayload_(code, message, details) {
  return {
    success: false,
    apiVersion: '1.0.0',
    generatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Tokyo',
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    ),
    error: {
      code: String(code || 'UNKNOWN_ERROR'),
      message: String(message || '不明なエラーが発生しました。'),
      details: details || null,
    },
  };
}

function createApiOutput_(payload, callbackName) {
  const json = JSON.stringify(payload);
  const safeCallback = sanitizeJsonpCallback_(callbackName);

  if (safeCallback) {
    return ContentService
      .createTextOutput(safeCallback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeJsonpCallback_(callbackName) {
  const value = String(callbackName || '').trim();

  if (!value) {
    return '';
  }

  const pattern =
    /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/;

  return pattern.test(value) ? value : '';
}

function createSuccessResponse_(data, callbackName) {
  return createApiOutput_(
    buildSuccessPayload_(data),
    callbackName
  );
}

function createErrorResponse_(
  code,
  message,
  details,
  callbackName
) {
  return createApiOutput_(
    buildErrorPayload_(code, message, details),
    callbackName
  );
}

class ApiError_ extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError_';
    this.code = code || 'API_ERROR';
    this.details = details || null;
  }
}
