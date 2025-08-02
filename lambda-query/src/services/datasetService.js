/**
 * Servicio de datasets para la función Lambda Query
 * Maneja operaciones relacionadas con datasets y metadatos
 * @module lambda-query/services/datasetService
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const AWS = require('aws-sdk');

// Configuración de AWS
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Variables de entorno
const RAW_BUCKET = process.env.S3_BUCKET_RAW;
const DDB_TABLE = process.env.DDB_TABLE_NAME;

/**
 * Inicializar el servicio de datasets
 */
exports.initialize = async () => {
  logger.info('Inicializando Dataset Service', {
    rawBucket: RAW_BUCKET,
    ddbTable: DDB_TABLE
  });

  // Validar variables de entorno
  if (!RAW_BUCKET || !DDB_TABLE) {
    throw createError('CONFIGURATION_ERROR', 
      'Variables de entorno S3_BUCKET_RAW y DDB_TABLE_NAME son requeridas');
  }
};

/**
 * Limpiar recursos del servicio
 */
exports.cleanup = async () => {
  logger.info('Limpiando Dataset Service');
  // Aquí se pueden limpiar recursos si es necesario
};

/**
 * Listar todos los datasets disponibles
 * @returns {Array} - Lista de datasets
 */
exports.listDatasets = async () => {
  const startTime = Date.now();
  
  try {
    logger.info('Listando datasets disponibles');

    // Obtener todos los registros de DynamoDB
    const params = {
      TableName: DDB_TABLE,
      ProjectionExpression: 'tableName, fileName, directory, status, createdAt, description, recordCount, fileSize'
    };

    const result = await dynamodb.scan(params).promise();
    
    // Agrupar por tabla
    const tableGroups = {};
    result.Items.forEach(item => {
      if (!tableGroups[item.tableName]) {
        tableGroups[item.tableName] = {
          name: item.tableName,
          description: item.description || '',
          directory: item.directory,
          status: item.status || 'pending',
          createdAt: item.createdAt,
          lastUpdated: item.createdAt,
          files: [],
          totalRecords: 0,
          totalSize: 0
        };
      }
      
      tableGroups[item.tableName].files.push({
        name: item.fileName,
        size: item.fileSize || 0,
        status: item.status || 'pending',
        createdAt: item.createdAt
      });
      
      tableGroups[item.tableName].totalRecords += item.recordCount || 0;
      tableGroups[item.tableName].totalSize += item.fileSize || 0;
      
      // Actualizar última modificación
      if (new Date(item.createdAt) > new Date(tableGroups[item.tableName].lastUpdated)) {
        tableGroups[item.tableName].lastUpdated = item.createdAt;
      }
    });

    // Convertir a array y ordenar por última modificación
    const datasets = Object.values(tableGroups)
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
      .map(dataset => ({
        ...dataset,
        createdAt: new Date(dataset.createdAt).toISOString(),
        lastUpdated: new Date(dataset.lastUpdated).toISOString(),
        fileCount: dataset.files.length,
        totalSizeMB: Math.round((dataset.totalSize / (1024 * 1024)) * 100) / 100
      }));

    const processingTime = Date.now() - startTime;
    
    logPerformance('LIST_DATASETS_SUCCESS', processingTime, {
      datasetCount: datasets.length
    });

    logger.info('Datasets listados correctamente', {
      datasetCount: datasets.length,
      processingTime
    });

    return datasets;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      processingTime
    }, 'datasetService');

    throw error;
  }
};

/**
 * Obtener información detallada de un dataset específico
 * @param {string} datasetId - ID del dataset (nombre de la tabla)
 * @returns {Object} - Información del dataset
 */
exports.getDataset = async (datasetId) => {
  const startTime = Date.now();
  
  try {
    logger.info('Obteniendo información del dataset', { datasetId });

    // Obtener registros de la tabla desde DynamoDB
    const params = {
      TableName: DDB_TABLE,
      FilterExpression: 'tableName = :tableName',
      ExpressionAttributeValues: {
        ':tableName': datasetId
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    if (result.Items.length === 0) {
      throw createError('NOT_FOUND', `Dataset ${datasetId} no encontrado`);
    }

    // Obtener el registro más reciente para metadatos principales
    const latestRecord = result.Items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];

    // Obtener archivos CSV desde S3 usando las rutas reales
    const csvFiles = await getCsvFilesFromS3(result.Items);

    // Construir respuesta
    const dataset = {
      name: latestRecord.tableName,
      description: latestRecord.description || '',
      directory: latestRecord.directory,
      status: latestRecord.status || 'pending',
      createdAt: latestRecord.createdAt,
      lastUpdated: latestRecord.createdAt,
      schema: latestRecord.schema || [],
      files: result.Items.map(item => ({
        name: item.fileName,
        size: item.fileSize || 0,
        status: item.status || 'pending',
        createdAt: item.createdAt,
        recordCount: item.recordCount || 0,
        s3Key: item.s3Key,
        fileId: item.fileId
      })),
      csvFiles: csvFiles,
      totalRecords: result.Items.reduce((sum, item) => sum + (item.recordCount || 0), 0),
      totalSize: result.Items.reduce((sum, item) => sum + (item.fileSize || 0), 0),
      fileCount: result.Items.length,
      csvFileCount: csvFiles.length
    };

    const processingTime = Date.now() - startTime;
    
    logPerformance('GET_DATASET_SUCCESS', processingTime, {
      datasetId,
      fileCount: dataset.fileCount,
      csvFileCount: dataset.csvFileCount
    });

    logger.info('Información del dataset obtenida correctamente', {
      datasetId,
      fileCount: dataset.fileCount,
      processingTime
    });

    return dataset;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      datasetId,
      processingTime
    }, 'datasetService');

    throw error;
  }
};

/**
 * Obtener archivos CSV de un dataset desde S3 usando las rutas reales de DynamoDB
 * @param {Array} ddbItems - Items de DynamoDB con rutas de archivos
 * @returns {Array} - Lista de archivos CSV
 */
async function getCsvFilesFromS3(ddbItems) {
  try {
    const csvFiles = [];
    
    for (const item of ddbItems) {
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
            sizeMB: Math.round((headResult.ContentLength / (1024 * 1024)) * 100) / 100,
            lastModified: headResult.LastModified,
            etag: headResult.ETag,
            fileId: item.fileId,
            status: item.status
          });
        } catch (headError) {
          logger.warn('Archivo no encontrado en S3', {
            s3Key: item.s3Key,
            fileId: item.fileId,
            error: headError.message
          });
        }
      }
    }

    return csvFiles;

  } catch (error) {
    logger.warn('Error obteniendo archivos CSV desde S3', {
      error: error.message
    });
    return [];
  }
}

/**
 * Obtener estadísticas de un dataset
 * @param {string} datasetId - ID del dataset
 * @returns {Object} - Estadísticas del dataset
 */
exports.getDatasetStats = async (datasetId) => {
  try {
    const dataset = await exports.getDataset(datasetId);
    
    const stats = {
      name: dataset.name,
      totalFiles: dataset.fileCount,
      totalCsvFiles: dataset.csvFileCount,
      totalRecords: dataset.totalRecords,
      totalSizeMB: Math.round((dataset.totalSize / (1024 * 1024)) * 100) / 100,
      averageFileSizeMB: dataset.fileCount > 0 ? 
        Math.round((dataset.totalSize / (1024 * 1024) / dataset.fileCount) * 100) / 100 : 0,
      averageRecordsPerFile: dataset.fileCount > 0 ? 
        Math.round(dataset.totalRecords / dataset.fileCount) : 0,
      status: dataset.status,
      lastUpdated: dataset.lastUpdated
    };

    return stats;

  } catch (error) {
    logger.error('Error obteniendo estadísticas del dataset', {
      datasetId,
      error: error.message
    });
    throw error;
  }
}; 