/**
 * Códigos de error estandarizados para el sistema
 * @module constants/errorCodes
 */

// Códigos de error HTTP
const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

// Códigos de error personalizados del sistema
const ERROR_CODES = {
  // Errores de validación
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  INVALID_FILE_SIZE: 'INVALID_FILE_SIZE',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  INVALID_SQL_QUERY: 'INVALID_SQL_QUERY',
  
  // Errores de archivo
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  FILE_PROCESSING_FAILED: 'FILE_PROCESSING_FAILED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  
  // Errores de AWS
  AWS_S3_ERROR: 'AWS_S3_ERROR',
  AWS_DYNAMODB_ERROR: 'AWS_DYNAMODB_ERROR',
  AWS_LAMBDA_ERROR: 'AWS_LAMBDA_ERROR',
  AWS_CREDENTIALS_ERROR: 'AWS_CREDENTIALS_ERROR',
  
  // Errores de procesamiento
  ETL_PROCESSING_ERROR: 'ETL_PROCESSING_ERROR',
  DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  
  // Errores de autenticación/autorización
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // Errores de configuración
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  MISSING_ENVIRONMENT_VARIABLE: 'MISSING_ENVIRONMENT_VARIABLE',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  
  // Errores de sistema
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

// Mensajes de error descriptivos
const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Error de validación en los datos de entrada',
  [ERROR_CODES.INVALID_FILE_TYPE]: 'Tipo de archivo no permitido',
  [ERROR_CODES.INVALID_FILE_SIZE]: 'Tamaño de archivo excede el límite permitido',
  [ERROR_CODES.INVALID_SCHEMA]: 'Esquema de archivo inválido o no compatible',
  [ERROR_CODES.INVALID_SQL_QUERY]: 'Consulta SQL inválida o no permitida',
  
  [ERROR_CODES.FILE_UPLOAD_FAILED]: 'Error al cargar el archivo al servidor',
  [ERROR_CODES.FILE_PROCESSING_FAILED]: 'Error al procesar el archivo',
  [ERROR_CODES.FILE_NOT_FOUND]: 'Archivo no encontrado',
  [ERROR_CODES.FILE_CORRUPTED]: 'Archivo corrupto o dañado',
  
  [ERROR_CODES.AWS_S3_ERROR]: 'Error en el servicio S3 de AWS',
  [ERROR_CODES.AWS_DYNAMODB_ERROR]: 'Error en el servicio DynamoDB de AWS',
  [ERROR_CODES.AWS_LAMBDA_ERROR]: 'Error en la función Lambda de AWS',
  [ERROR_CODES.AWS_CREDENTIALS_ERROR]: 'Error en las credenciales de AWS',
  
  [ERROR_CODES.ETL_PROCESSING_ERROR]: 'Error en el procesamiento ETL',
  [ERROR_CODES.DATABASE_QUERY_ERROR]: 'Error en la consulta a la base de datos',
  [ERROR_CODES.MEMORY_LIMIT_EXCEEDED]: 'Límite de memoria excedido',
  
  [ERROR_CODES.AUTHENTICATION_FAILED]: 'Autenticación fallida',
  [ERROR_CODES.AUTHORIZATION_DENIED]: 'Acceso denegado',
  [ERROR_CODES.INVALID_TOKEN]: 'Token de autenticación inválido',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Token de autenticación expirado',
  
  [ERROR_CODES.CONFIGURATION_ERROR]: 'Error en la configuración del sistema',
  [ERROR_CODES.MISSING_ENVIRONMENT_VARIABLE]: 'Variable de entorno requerida no encontrada',
  [ERROR_CODES.INVALID_CONFIGURATION]: 'Configuración inválida',
  
  [ERROR_CODES.INTERNAL_ERROR]: 'Error interno del servidor',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Servicio temporalmente no disponible',
  [ERROR_CODES.TIMEOUT_ERROR]: 'Tiempo de espera agotado',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Límite de tasa excedido'
};

// Mapeo de códigos de error a códigos HTTP
const ERROR_TO_HTTP_MAPPING = {
  [ERROR_CODES.VALIDATION_ERROR]: HTTP_STATUS_CODES.BAD_REQUEST,
  [ERROR_CODES.INVALID_FILE_TYPE]: HTTP_STATUS_CODES.BAD_REQUEST,
  [ERROR_CODES.INVALID_FILE_SIZE]: HTTP_STATUS_CODES.BAD_REQUEST,
  [ERROR_CODES.INVALID_SCHEMA]: HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY,
  [ERROR_CODES.INVALID_SQL_QUERY]: HTTP_STATUS_CODES.BAD_REQUEST,
  
  [ERROR_CODES.FILE_UPLOAD_FAILED]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.FILE_PROCESSING_FAILED]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.FILE_NOT_FOUND]: HTTP_STATUS_CODES.NOT_FOUND,
  [ERROR_CODES.FILE_CORRUPTED]: HTTP_STATUS_CODES.BAD_REQUEST,
  
  [ERROR_CODES.AWS_S3_ERROR]: HTTP_STATUS_CODES.BAD_GATEWAY,
  [ERROR_CODES.AWS_DYNAMODB_ERROR]: HTTP_STATUS_CODES.BAD_GATEWAY,
  [ERROR_CODES.AWS_LAMBDA_ERROR]: HTTP_STATUS_CODES.BAD_GATEWAY,
  [ERROR_CODES.AWS_CREDENTIALS_ERROR]: HTTP_STATUS_CODES.UNAUTHORIZED,
  
  [ERROR_CODES.ETL_PROCESSING_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.DATABASE_QUERY_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.MEMORY_LIMIT_EXCEEDED]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  
  [ERROR_CODES.AUTHENTICATION_FAILED]: HTTP_STATUS_CODES.UNAUTHORIZED,
  [ERROR_CODES.AUTHORIZATION_DENIED]: HTTP_STATUS_CODES.FORBIDDEN,
  [ERROR_CODES.INVALID_TOKEN]: HTTP_STATUS_CODES.UNAUTHORIZED,
  [ERROR_CODES.TOKEN_EXPIRED]: HTTP_STATUS_CODES.UNAUTHORIZED,
  
  [ERROR_CODES.CONFIGURATION_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.MISSING_ENVIRONMENT_VARIABLE]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.INVALID_CONFIGURATION]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  
  [ERROR_CODES.INTERNAL_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: HTTP_STATUS_CODES.SERVICE_UNAVAILABLE,
  [ERROR_CODES.TIMEOUT_ERROR]: HTTP_STATUS_CODES.REQUEST_TIMEOUT,
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
};

/**
 * Obtiene el código HTTP correspondiente a un código de error
 * @param {string} errorCode - Código de error del sistema
 * @returns {number} - Código HTTP correspondiente
 */
const getHttpStatusCode = (errorCode) => {
  return ERROR_TO_HTTP_MAPPING[errorCode] || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR;
};

/**
 * Obtiene el mensaje de error descriptivo
 * @param {string} errorCode - Código de error del sistema
 * @returns {string} - Mensaje descriptivo del error
 */
const getErrorMessage = (errorCode) => {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
};

/**
 * Crea un objeto de error estandarizado
 * @param {string} errorCode - Código de error del sistema
 * @param {string} [customMessage] - Mensaje personalizado opcional
 * @param {Object} [details] - Detalles adicionales del error
 * @returns {Object} - Objeto de error estandarizado
 */
const createError = (errorCode, customMessage = null, details = {}) => {
  return {
    code: errorCode,
    message: customMessage || getErrorMessage(errorCode),
    statusCode: getHttpStatusCode(errorCode),
    timestamp: new Date().toISOString(),
    details
  };
};

module.exports = {
  HTTP_STATUS_CODES,
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_TO_HTTP_MAPPING,
  getHttpStatusCode,
  getErrorMessage,
  createError
}; 