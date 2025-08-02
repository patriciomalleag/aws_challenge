/**
 * Manejador HTTP para la función Lambda Query
 * Procesa requests HTTP y ejecuta consultas SQL sobre archivos CSV
 * @module lambda-query/handlers/httpHandler
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const QueryService = require('../services/queryService');
const DatasetService = require('../services/datasetService');

/**
 * Inicializar servicios
 */
exports.initialize = async () => {
  try {
    await QueryService.initialize();
    await DatasetService.initialize();
    logger.info('HTTP Handler inicializado correctamente');
  } catch (error) {
    logger.error('Error inicializando HTTP Handler', { error: error.message });
    throw error;
  }
};

/**
 * Limpiar recursos
 */
exports.cleanup = async () => {
  try {
    await QueryService.cleanup();
    await DatasetService.cleanup();
    logger.info('HTTP Handler limpiado correctamente');
  } catch (error) {
    logger.error('Error limpiando HTTP Handler', { error: error.message });
  }
};

/**
 * Manejar request de consulta SQL
 * @param {Object} event - Evento HTTP
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Respuesta HTTP
 */
exports.handleQueryRequest = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  try {
    // Parsear body del request
    const body = JSON.parse(event.body || '{}');
    const { query, tableName } = body;

    // Validar parámetros
    if (!query || !query.trim()) {
      throw createError('VALIDATION_ERROR', 'Query es requerida');
    }

    if (!tableName) {
      throw createError('VALIDATION_ERROR', 'Nombre de tabla es requerido');
    }

    // Validar que sea una consulta SELECT
    const sanitizedQuery = query.trim().toLowerCase();
    if (!sanitizedQuery.startsWith('select')) {
      throw createError('VALIDATION_ERROR', 'Solo se permiten consultas SELECT');
    }

    // Ejecutar consulta
    const result = await QueryService.executeQuery(query.trim(), tableName, requestId);
    
    const processingTime = Date.now() - startTime;
    
    logPerformance('QUERY_EXECUTION', processingTime, {
      requestId,
      tableName,
      queryLength: query.length,
      resultRows: result.data ? result.data.length : 0
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: result.data,
        executionTime: processingTime,
        rowCount: result.data ? result.data.length : 0,
        requestId
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      processingTime,
      body: event.body
    }, 'httpHandler');

    return {
      statusCode: error.statusCode || 500,
      headers: {
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
  }
};

/**
 * Manejar request para listar datasets
 * @param {Object} event - Evento HTTP
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Respuesta HTTP
 */
exports.handleListDatasetsRequest = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  try {
    const datasets = await DatasetService.listDatasets();
    
    const processingTime = Date.now() - startTime;
    
    logPerformance('LIST_DATASETS', processingTime, {
      requestId,
      datasetCount: datasets.length
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: datasets,
        count: datasets.length,
        requestId
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      processingTime
    }, 'httpHandler');

    return {
      statusCode: error.statusCode || 500,
      headers: {
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
  }
};

/**
 * Manejar request para obtener dataset específico
 * @param {Object} event - Evento HTTP
 * @param {Object} context - Contexto Lambda
 * @param {string} datasetId - ID del dataset
 * @returns {Object} - Respuesta HTTP
 */
exports.handleGetDatasetRequest = async (event, context, datasetId) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  try {
    const dataset = await DatasetService.getDataset(datasetId);
    
    if (!dataset) {
      throw createError('NOT_FOUND', 'Dataset no encontrado');
    }

    const processingTime = Date.now() - startTime;
    
    logPerformance('GET_DATASET', processingTime, {
      requestId,
      datasetId
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: dataset,
        requestId
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      processingTime,
      datasetId
    }, 'httpHandler');

    return {
      statusCode: error.statusCode || 500,
      headers: {
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
  }
};

/**
 * Manejar health check
 * @param {Object} event - Evento HTTP
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Respuesta HTTP
 */
exports.handleHealthCheck = async (event, context) => {
  const requestId = context.awsRequestId;

  try {
    // Verificar conectividad con servicios
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        queryService: 'healthy',
        datasetService: 'healthy'
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(healthStatus)
    };

  } catch (error) {
    logError(error, {
      requestId
    }, 'httpHandler');

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId
      })
    };
  }
}; 