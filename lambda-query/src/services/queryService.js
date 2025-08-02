/**
 * Servicio de consultas SQL para archivos CSV
 * Utiliza SQLite para ejecutar consultas SQL sobre archivos CSV almacenados en S3
 * @module lambda-query/services/queryService
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const AWS = require('aws-sdk');
const sqlEngine = require('./simpleSqlEngine');

// Configuración de AWS
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Variables de entorno
const RAW_BUCKET = process.env.S3_BUCKET_RAW;
const DDB_TABLE = process.env.DDB_TABLE_NAME;
const MAX_QUERY_TIMEOUT_MS = parseInt(process.env.MAX_QUERY_TIMEOUT_MS) || 30000;
const MAX_RESULT_ROWS = parseInt(process.env.MAX_RESULT_ROWS) || 1000;

/**
 * Inicializar el servicio de consultas
 */
exports.initialize = async () => {
  logger.info('Inicializando Query Service', {
    rawBucket: RAW_BUCKET,
    ddbTable: DDB_TABLE,
    maxTimeout: MAX_QUERY_TIMEOUT_MS,
    maxResultRows: MAX_RESULT_ROWS
  });

  // Validar variables de entorno
  if (!RAW_BUCKET || !DDB_TABLE) {
    throw createError('CONFIGURATION_ERROR', 
      'Variables de entorno S3_BUCKET_RAW y DDB_TABLE_NAME son requeridas');
  }

  // Inicializar motor SQL
  await sqlEngine.initialize();
};

/**
 * Limpiar recursos del servicio
 */
exports.cleanup = async () => {
  logger.info('Limpiando Query Service');
  // Limpiar motor SQL
  await sqlEngine.cleanup();
};

/**
 * Ejecutar consulta SQL sobre archivos CSV
 * @param {string} query - Consulta SQL a ejecutar
 * @param {string} tableName - Nombre de la tabla
 * @param {string} requestId - ID de la request para logging
 * @returns {Object} - Resultados de la consulta
 */
exports.executeQuery = async (query, tableName, requestId) => {
  const startTime = Date.now();
  
  logger.info('Ejecutando consulta SQL', {
    requestId,
    tableName,
    query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    maxTimeout: MAX_QUERY_TIMEOUT_MS
  });

  try {
    // 1. Obtener metadatos de la tabla desde DynamoDB
    const tableMetadata = await getTableMetadata(tableName, requestId);
    
    // 2. Obtener archivos CSV de la tabla
    const csvFiles = await getCsvFiles(tableName, requestId);
    
    if (csvFiles.length === 0) {
      throw createError('NOT_FOUND', `No se encontraron archivos CSV para la tabla ${tableName}`);
    }

    // 3. Ejecutar consulta SQL real
    const results = await sqlEngine.executeQuery(query, csvFiles, tableName, requestId);

    const processingTime = Date.now() - startTime;
    
    logPerformance('QUERY_EXECUTION_SUCCESS', processingTime, {
      requestId,
      tableName,
      csvFilesCount: csvFiles.length,
      resultRows: results.length
    });

    return {
      data: results,
      metadata: {
        tableName,
        csvFilesCount: csvFiles.length,
        processingTime,
        requestId
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      tableName,
      query: query.substring(0, 100),
      processingTime
    }, 'queryService');

    throw error;
  }
};

/**
 * Obtener metadatos de la tabla desde DynamoDB
 * @param {string} tableName - Nombre de la tabla
 * @param {string} requestId - ID de la request
 * @returns {Object} - Metadatos de la tabla
 */
async function getTableMetadata(tableName, requestId) {
  try {
    const params = {
      TableName: DDB_TABLE,
      FilterExpression: 'tableName = :tableName',
      ExpressionAttributeValues: {
        ':tableName': tableName
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    if (result.Items.length === 0) {
      throw createError('NOT_FOUND', `Tabla ${tableName} no encontrada`);
    }

    // Obtener el registro más reciente
    const latestRecord = result.Items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];

    logger.info('Metadatos de tabla obtenidos', {
      requestId,
      tableName,
      recordCount: latestRecord.recordCount,
      status: latestRecord.status
    });

    return latestRecord;

  } catch (error) {
    logger.error('Error obteniendo metadatos de tabla', {
      requestId,
      tableName,
      error: error.message
    });
    throw error;
  }
}

/**
 * Obtener archivos CSV de la tabla desde S3
 * @param {string} tableName - Nombre de la tabla
 * @param {string} requestId - ID de la request
 * @returns {Array} - Lista de archivos CSV
 */
async function getCsvFiles(tableName, requestId) {
  try {
    // Primero obtener los metadatos de la tabla para conocer los archivos
    const params = {
      TableName: DDB_TABLE,
      FilterExpression: 'tableName = :tableName AND (#st = :completed OR #st = :pending)',
      ExpressionAttributeValues: {
        ':tableName': tableName,
        ':completed': 'completed',
        ':pending': 'pending'
      },
      ExpressionAttributeNames: {
        '#st': 'status'
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    if (!result.Items || result.Items.length === 0) {
      logger.info('No se encontraron archivos disponibles para la tabla', {
        requestId,
        tableName
      });
      return [];
    }

    // Obtener todos los archivos CSV desde S3 usando las rutas de DynamoDB
    const csvFiles = [];
    
    for (const item of result.Items) {
      if (item.s3Key && item.s3Key.endsWith('.csv')) {
        try {
          // Verificar que el archivo existe en S3
          const headParams = {
            Bucket: RAW_BUCKET,
            Key: item.s3Key
          };
          
          const headResult = await s3.headObject(headParams).promise();
          
          csvFiles.push({
            key: item.s3Key,
            size: headResult.ContentLength,
            lastModified: headResult.LastModified,
            fileId: item.fileId,
            tableName: item.tableName,
            directory: item.directory
          });
        } catch (headError) {
          logger.warn('Archivo no encontrado en S3', {
            requestId,
            tableName,
            s3Key: item.s3Key,
            error: headError.message
          });
        }
      }
    }

    logger.info('Archivos CSV encontrados', {
      requestId,
      tableName,
      fileCount: csvFiles.length,
      totalSize: csvFiles.reduce((sum, file) => sum + file.size, 0)
    });

    return csvFiles;

  } catch (error) {
    logger.error('Error obteniendo archivos CSV', {
      requestId,
      tableName,
      error: error.message
    });
    throw error;
  }
}

 