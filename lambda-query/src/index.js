/**
 * Punto de entrada principal para la función Lambda Query
 * Proporciona endpoints HTTP para consultas SQL ad-hoc sobre archivos CSV
 * @module lambda-query/index
 */

const { logger, logError, logPerformance } = require('../../shared/utils/logger');
const { createError } = require('../../shared/constants/errorCodes');
const HttpHandler = require('./handlers/httpHandler');

/**
 * Manejador principal de la función Lambda con URL pública
 * @param {Object} event - Evento HTTP de API Gateway
 * @param {Object} context - Contexto de ejecución Lambda
 * @returns {Object} - Respuesta HTTP
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;
  
  logger.info('Request HTTP recibido', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers
  });

  try {
    // Configurar headers CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'false'
    };

    // Manejar preflight OPTIONS
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    // Procesar request según el método y path
    let response;
    
    switch (event.httpMethod) {
      case 'POST':
        if (event.path === '/query') {
          response = await HttpHandler.handleQueryRequest(event, context);
        } else {
          throw createError('NOT_FOUND', `Endpoint no encontrado: ${event.path}`);
        }
        break;
        
      case 'GET':
        if (event.path === '/datasets') {
          response = await HttpHandler.handleListDatasetsRequest(event, context);
        } else if (event.path.match(/^\/datasets\/[^\/]+$/)) {
          const datasetId = event.path.split('/')[2];
          response = await HttpHandler.handleGetDatasetRequest(event, context, datasetId);
        } else if (event.path === '/health') {
          response = await HttpHandler.handleHealthCheck(event, context);
        } else {
          throw createError('NOT_FOUND', `Endpoint no encontrado: ${event.path}`);
        }
        break;
        
      default:
        throw createError('METHOD_NOT_ALLOWED', `Método HTTP no soportado: ${event.httpMethod}`);
    }

    // Agregar headers CORS a la respuesta
    response.headers = {
      ...corsHeaders,
      ...response.headers
    };

    // Calcular tiempo de procesamiento
    const processingTime = Date.now() - startTime;
    
    logPerformance('HTTP_REQUEST', processingTime, {
      requestId,
      method: event.httpMethod,
      path: event.path,
      statusCode: response.statusCode
    });

    logger.info('Request HTTP procesado exitosamente', {
      requestId,
      method: event.httpMethod,
      path: event.path,
      statusCode: response.statusCode,
      processingTime
    });

    return response;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      method: event.httpMethod,
      path: event.path,
      processingTime
    }, 'lambda-query');

    // Formatear respuesta de error
    const errorResponse = {
      statusCode: error.statusCode || 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Credentials': 'false',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Error interno del servidor',
        code: error.code || 'INTERNAL_ERROR',
        requestId,
        timestamp: new Date().toISOString()
      })
    };

    return errorResponse;
  }
};

/**
 * Función de inicialización (cold start)
 * Se ejecuta una vez cuando se crea una nueva instancia de Lambda
 */
exports.initialize = async () => {
  logger.info('Inicializando función Lambda Query', {
    environment: process.env.NODE_ENV || 'production',
    region: process.env.AWS_REGION,
    memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT
  });

  // Validar variables de entorno requeridas
  const requiredEnvVars = [
    'S3_BUCKET_RAW',
    'DDB_TABLE_NAME',
    'MAX_QUERY_TIMEOUT_MS',
    'MAX_RESULT_ROWS'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw createError('CONFIGURATION_ERROR', 
      `Variables de entorno faltantes: ${missingVars.join(', ')}`);
  }

  // Inicializar servicios
  try {
    await HttpHandler.initialize();
    logger.info('Función Lambda Query inicializada correctamente');
  } catch (error) {
    logger.error('Error inicializando servicios', { error: error.message });
    throw error;
  }
};

/**
 * Función de limpieza (opcional)
 * Se ejecuta antes de que la instancia de Lambda se destruya
 */
exports.cleanup = async () => {
  logger.info('Limpiando recursos de la función Lambda Query');
  
  try {
    await HttpHandler.cleanup();
    logger.info('Limpieza completada');
  } catch (error) {
    logger.error('Error en limpieza', { error: error.message });
  }
};

// Ejecutar inicialización si se llama directamente
if (require.main === module) {
  exports.initialize()
    .then(() => {
      logger.info('Inicialización completada');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error en inicialización', { error: error.message });
      process.exit(1);
    });
} 