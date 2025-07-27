/**
 * Punto de entrada principal para la función Lambda ETL
 * Procesa archivos CSV cargados en S3, los valida y convierte a Parquet
 * @module lambda-etl/index
 */

const { logger, logError, logPerformance } = require('../../shared/utils/logger');
const { createError } = require('../../shared/constants/errorCodes');
const S3EventHandler = require('./handlers/s3EventHandler');

/**
 * Manejador principal de la función Lambda
 * @param {Object} event - Evento S3 que dispara la función
 * @param {Object} context - Contexto de ejecución Lambda
 * @returns {Object} - Respuesta de la función
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;
  
  logger.info('Iniciando procesamiento ETL', {
    requestId,
    eventSource: event.Records?.[0]?.eventSource,
    eventName: event.Records?.[0]?.eventName,
    recordCount: event.Records?.length || 0
  });

  try {
    // Validar que el evento contenga registros S3
    if (!event.Records || !Array.isArray(event.Records)) {
      throw createError('VALIDATION_ERROR', 'Evento inválido: no contiene registros S3');
    }

    // Procesar cada registro S3
    const results = [];
    for (const record of event.Records) {
      try {
        const result = await S3EventHandler.processS3Event(record, context);
        results.push({
          success: true,
          bucket: record.s3.bucket.name,
          key: record.s3.object.key,
          datasetId: result.datasetId
        });
      } catch (error) {
        logger.error('Error procesando registro S3', {
          requestId,
          bucket: record.s3?.bucket?.name,
          key: record.s3?.object?.key,
          error: error.message
        });

        results.push({
          success: false,
          bucket: record.s3?.bucket?.name,
          key: record.s3?.object?.key,
          error: error.message
        });
      }
    }

    // Calcular métricas de rendimiento
    const processingTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    logPerformance('ETL_PROCESSING', processingTime, {
      requestId,
      totalRecords: results.length,
      successCount,
      failureCount,
      averageTimePerRecord: processingTime / results.length
    });

    logger.info('Procesamiento ETL completado', {
      requestId,
      processingTime,
      successCount,
      failureCount,
      results
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Procesamiento ETL completado',
        requestId,
        processingTime,
        results: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
          details: results
        }
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      processingTime,
      event: JSON.stringify(event)
    }, 'lambda-etl');

    // Re-lanzar el error para que Lambda lo maneje
    throw error;
  }
};

/**
 * Función de inicialización (cold start)
 * Se ejecuta una vez cuando se crea una nueva instancia de Lambda
 */
exports.initialize = async () => {
  logger.info('Inicializando función Lambda ETL', {
    environment: process.env.NODE_ENV || 'production',
    region: process.env.AWS_REGION,
    memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT
  });

  // Validar variables de entorno requeridas
  const requiredEnvVars = [
    'S3_BUCKET_RAW',
    'S3_BUCKET_CURATED',
    'DDB_TABLE_NAME'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw createError('CONFIGURATION_ERROR', 
      `Variables de entorno faltantes: ${missingVars.join(', ')}`);
  }

  logger.info('Función Lambda ETL inicializada correctamente');
};

/**
 * Función de limpieza (opcional)
 * Se ejecuta antes de que la instancia de Lambda se destruya
 */
exports.cleanup = async () => {
  logger.info('Limpiando recursos de la función Lambda ETL');
  
  // Aquí se pueden limpiar recursos como conexiones a bases de datos
  // o archivos temporales si es necesario
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