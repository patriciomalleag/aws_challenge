/**
 * Formateador de respuestas HTTP estandarizadas
 * @module utils/responseFormatter
 */

const { HTTP_STATUS_CODES, createError } = require('../constants/errorCodes');

/**
 * Formatea una respuesta exitosa
 * @param {number} statusCode - Código de estado HTTP
 * @param {Object} data - Datos de la respuesta
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Object} - Respuesta formateada
 */
const formatSuccessResponse = (statusCode = HTTP_STATUS_CODES.OK, data = null, metadata = {}) => {
  const response = {
    success: true,
    statusCode,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  if (data !== null) {
    response.data = data;
  }

  return response;
};

/**
 * Formatea una respuesta de error
 * @param {number} statusCode - Código de estado HTTP
 * @param {string} message - Mensaje de error
 * @param {string} code - Código de error personalizado
 * @param {Object} details - Detalles adicionales del error
 * @returns {Object} - Respuesta de error formateada
 */
const formatErrorResponse = (statusCode = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, message = 'Error interno del servidor', code = null, details = {}) => {
  const response = {
    success: false,
    statusCode,
    message,
    timestamp: new Date().toISOString(),
    ...details
  };

  if (code) {
    response.code = code;
  }

  return response;
};

/**
 * Formatea una respuesta usando el objeto de error estandarizado
 * @param {Object} error - Objeto de error estandarizado
 * @returns {Object} - Respuesta de error formateada
 */
const formatErrorFromObject = (error) => {
  return formatErrorResponse(
    error.statusCode,
    error.message,
    error.code,
    error.details
  );
};

/**
 * Formatea una respuesta de validación
 * @param {Array} validationErrors - Array de errores de validación
 * @returns {Object} - Respuesta de validación formateada
 */
const formatValidationResponse = (validationErrors) => {
  return formatErrorResponse(
    HTTP_STATUS_CODES.BAD_REQUEST,
    'Error de validación en los datos de entrada',
    'VALIDATION_ERROR',
    { validationErrors }
  );
};

/**
 * Formatea una respuesta de paginación
 * @param {Array} data - Datos de la página actual
 * @param {number} page - Número de página actual
 * @param {number} limit - Límite de elementos por página
 * @param {number} total - Total de elementos
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Object} - Respuesta paginada formateada
 */
const formatPaginatedResponse = (data, page, limit, total, metadata = {}) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return formatSuccessResponse(HTTP_STATUS_CODES.OK, data, {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null
    },
    ...metadata
  });
};

/**
 * Formatea una respuesta de lista con metadatos
 * @param {Array} data - Lista de datos
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Object} - Respuesta de lista formateada
 */
const formatListResponse = (data, metadata = {}) => {
  return formatSuccessResponse(HTTP_STATUS_CODES.OK, data, {
    count: data.length,
    ...metadata
  });
};

/**
 * Formatea una respuesta de creación exitosa
 * @param {Object} data - Datos del recurso creado
 * @param {string} resourceType - Tipo de recurso creado
 * @returns {Object} - Respuesta de creación formateada
 */
const formatCreatedResponse = (data, resourceType = 'resource') => {
  return formatSuccessResponse(HTTP_STATUS_CODES.CREATED, data, {
    message: `${resourceType} creado exitosamente`,
    resourceType
  });
};

/**
 * Formatea una respuesta de actualización exitosa
 * @param {Object} data - Datos del recurso actualizado
 * @param {string} resourceType - Tipo de recurso actualizado
 * @returns {Object} - Respuesta de actualización formateada
 */
const formatUpdatedResponse = (data, resourceType = 'resource') => {
  return formatSuccessResponse(HTTP_STATUS_CODES.OK, data, {
    message: `${resourceType} actualizado exitosamente`,
    resourceType
  });
};

/**
 * Formatea una respuesta de eliminación exitosa
 * @param {string} resourceType - Tipo de recurso eliminado
 * @param {string} resourceId - ID del recurso eliminado
 * @returns {Object} - Respuesta de eliminación formateada
 */
const formatDeletedResponse = (resourceType = 'resource', resourceId = null) => {
  const metadata = {
    message: `${resourceType} eliminado exitosamente`,
    resourceType
  };

  if (resourceId) {
    metadata.resourceId = resourceId;
  }

  return formatSuccessResponse(HTTP_STATUS_CODES.NO_CONTENT, null, metadata);
};

/**
 * Formatea una respuesta de consulta SQL
 * @param {Array} columns - Nombres de las columnas
 * @param {Array} rows - Datos de las filas
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Object} - Respuesta de consulta formateada
 */
const formatQueryResponse = (columns, rows, metadata = {}) => {
  return formatSuccessResponse(HTTP_STATUS_CODES.OK, {
    columns,
    rows,
    rowCount: rows.length
  }, {
    message: 'Consulta ejecutada exitosamente',
    ...metadata
  });
};

/**
 * Middleware para Express que formatea automáticamente las respuestas
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
const responseFormatterMiddleware = (req, res, next) => {
  // Extender el objeto response con métodos de formateo
  res.success = (data = null, statusCode = HTTP_STATUS_CODES.OK, metadata = {}) => {
    const response = formatSuccessResponse(statusCode, data, metadata);
    return res.status(statusCode).json(response);
  };

  res.error = (message, statusCode = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, code = null, details = {}) => {
    const response = formatErrorResponse(statusCode, message, code, details);
    return res.status(statusCode).json(response);
  };

  res.validationError = (validationErrors) => {
    const response = formatValidationResponse(validationErrors);
    return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json(response);
  };

  res.paginated = (data, page, limit, total, metadata = {}) => {
    const response = formatPaginatedResponse(data, page, limit, total, metadata);
    return res.status(HTTP_STATUS_CODES.OK).json(response);
  };

  res.created = (data, resourceType = 'resource') => {
    const response = formatCreatedResponse(data, resourceType);
    return res.status(HTTP_STATUS_CODES.CREATED).json(response);
  };

  res.updated = (data, resourceType = 'resource') => {
    const response = formatUpdatedResponse(data, resourceType);
    return res.status(HTTP_STATUS_CODES.OK).json(response);
  };

  res.deleted = (resourceType = 'resource', resourceId = null) => {
    const response = formatDeletedResponse(resourceType, resourceId);
    return res.status(HTTP_STATUS_CODES.NO_CONTENT).json(response);
  };

  res.queryResult = (columns, rows, metadata = {}) => {
    const response = formatQueryResponse(columns, rows, metadata);
    return res.status(HTTP_STATUS_CODES.OK).json(response);
  };

  next();
};

module.exports = {
  formatSuccessResponse,
  formatErrorResponse,
  formatErrorFromObject,
  formatValidationResponse,
  formatPaginatedResponse,
  formatListResponse,
  formatCreatedResponse,
  formatUpdatedResponse,
  formatDeletedResponse,
  formatQueryResponse,
  responseFormatterMiddleware
}; 