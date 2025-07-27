/**
 * Sistema de logging estructurado para CloudWatch
 * @module utils/logger
 */

const winston = require('winston');
const { format } = winston;

// Configuración de niveles de log
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Colores para diferentes niveles
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Aplicar colores
winston.addColors(logColors);

/**
 * Formato personalizado para logs estructurados
 */
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
  })
);

/**
 * Formato para desarrollo local (más legible)
 */
const developmentFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * Configuración del logger
 */
const createLogger = (serviceName = 'data-pipeline') => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const logLevel = process.env.LOG_LEVEL || 'info';

  const logger = winston.createLogger({
    level: logLevel,
    levels: logLevels,
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV || 'production',
      version: process.env.APP_VERSION || '1.0.0'
    },
    format: isDevelopment ? developmentFormat : logFormat,
    transports: [
      // Console transport para desarrollo
      new winston.transports.Console({
        format: isDevelopment ? developmentFormat : logFormat
      })
    ]
  });

  // En producción, agregar transport para CloudWatch
  if (!isDevelopment && process.env.AWS_REGION) {
    // Nota: Para usar CloudWatch, se necesitaría winston-cloudwatch
    // logger.add(new winston.transports.CloudWatch({
    //   logGroupName: process.env.LOG_GROUP_NAME || '/aws/lambda/data-pipeline',
    //   logStreamName: `${serviceName}-${Date.now()}`,
    //   awsRegion: process.env.AWS_REGION
    // }));
  }

  return logger;
};

/**
 * Logger principal del sistema
 */
const logger = createLogger();

/**
 * Crea un logger específico para un módulo
 * @param {string} moduleName - Nombre del módulo
 * @returns {Object} - Logger configurado para el módulo
 */
const createModuleLogger = (moduleName) => {
  return createLogger(`data-pipeline-${moduleName}`);
};

/**
 * Función helper para logging de errores con contexto
 * @param {Error} error - Error a loggear
 * @param {Object} context - Contexto adicional
 * @param {string} moduleName - Nombre del módulo (opcional)
 */
const logError = (error, context = {}, moduleName = null) => {
  const logContext = {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    ...context
  };

  if (moduleName) {
    const moduleLogger = createModuleLogger(moduleName);
    moduleLogger.error('Error en módulo', logContext);
  } else {
    logger.error('Error del sistema', logContext);
  }
};

/**
 * Función helper para logging de métricas de rendimiento
 * @param {string} operation - Nombre de la operación
 * @param {number} duration - Duración en milisegundos
 * @param {Object} metadata - Metadatos adicionales
 */
const logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Métrica de rendimiento', {
    operation,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Función helper para logging de eventos de negocio
 * @param {string} event - Nombre del evento
 * @param {Object} data - Datos del evento
 * @param {string} userId - ID del usuario (opcional)
 */
const logBusinessEvent = (event, data = {}, userId = null) => {
  const logData = {
    event,
    data,
    timestamp: new Date().toISOString()
  };

  if (userId) {
    logData.userId = userId;
  }

  logger.info('Evento de negocio', logData);
};

/**
 * Función helper para logging de acceso a recursos
 * @param {string} resource - Recurso accedido
 * @param {string} action - Acción realizada
 * @param {string} userId - ID del usuario
 * @param {Object} metadata - Metadatos adicionales
 */
const logAccess = (resource, action, userId, metadata = {}) => {
  logger.info('Acceso a recurso', {
    resource,
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

/**
 * Middleware para Express que loggea requests HTTP
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log del request
  logger.http('Request recibido', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Interceptar el final de la respuesta
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.http('Response enviado', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration_ms: duration,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
  });

  next();
};

module.exports = {
  logger,
  createLogger,
  createModuleLogger,
  logError,
  logPerformance,
  logBusinessEvent,
  logAccess,
  httpLogger
}; 