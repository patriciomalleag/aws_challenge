/**
 * Servicio de consultas SQL para archivos Parquet
 * Utiliza DuckDB para ejecutar consultas SQL sobre archivos Parquet almacenados en S3
 * @module lambda-query/services/queryService
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const AWS = require('aws-sdk');
const sqlEngine = require('./sqlEngine');

// Configuración de AWS
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Variables de entorno
const CURATED_BUCKET = process.env.S3_BUCKET_CURATED;
const DDB_TABLE = process.env.DDB_TABLE_NAME;
const MAX_QUERY_TIMEOUT_MS = parseInt(process.env.MAX_QUERY_TIMEOUT_MS) || 30000;
const MAX_RESULT_ROWS = parseInt(process.env.MAX_RESULT_ROWS) || 1000;

/**
 * Inicializar el servicio de consultas
 */
exports.initialize = async () => {
  logger.info('Inicializando Query Service', {
    curatedBucket: CURATED_BUCKET,
    ddbTable: DDB_TABLE,
    maxTimeout: MAX_QUERY_TIMEOUT_MS,
    maxResultRows: MAX_RESULT_ROWS
  });

  // Validar variables de entorno
  if (!CURATED_BUCKET || !DDB_TABLE) {
    throw createError('CONFIGURATION_ERROR', 
      'Variables de entorno S3_BUCKET_CURATED y DDB_TABLE_NAME son requeridas');
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
 * Ejecutar consulta SQL sobre archivos Parquet
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
    
    // 2. Obtener archivos Parquet de la tabla
    const parquetFiles = await getParquetFiles(tableName, requestId);
    
    if (parquetFiles.length === 0) {
      throw createError('NOT_FOUND', `No se encontraron archivos Parquet para la tabla ${tableName}`);
    }

    // 3. Ejecutar consulta SQL real
    const results = await sqlEngine.executeQuery(query, parquetFiles, tableName, requestId);

    const processingTime = Date.now() - startTime;
    
    logPerformance('QUERY_EXECUTION_SUCCESS', processingTime, {
      requestId,
      tableName,
      parquetFilesCount: parquetFiles.length,
      resultRows: results.length
    });

    return {
      data: results,
      metadata: {
        tableName,
        parquetFilesCount: parquetFiles.length,
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
 * Obtener archivos Parquet de la tabla desde S3
 * @param {string} tableName - Nombre de la tabla
 * @param {string} requestId - ID de la request
 * @returns {Array} - Lista de archivos Parquet
 */
async function getParquetFiles(tableName, requestId) {
  try {
    const params = {
      Bucket: CURATED_BUCKET,
      Prefix: `${tableName}/`,
      MaxKeys: 1000
    };

    const result = await s3.listObjectsV2(params).promise();
    
    const parquetFiles = result.Contents
      .filter(obj => obj.Key.endsWith('.parquet'))
      .map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      }));

    logger.info('Archivos Parquet encontrados', {
      requestId,
      tableName,
      fileCount: parquetFiles.length,
      totalSize: parquetFiles.reduce((sum, file) => sum + file.size, 0)
    });

    return parquetFiles;

  } catch (error) {
    logger.error('Error obteniendo archivos Parquet', {
      requestId,
      tableName,
      error: error.message
    });
    throw error;
  }
}

 