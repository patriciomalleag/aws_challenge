/**
 * Servicio de catálogo para gestión de metadatos en DynamoDB
 * @module lambda-etl/services/catalogService
 */

const AWS = require('aws-sdk');
const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');

// Configurar DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DDB_TABLE_NAME || 'datasets-catalog';

/**
 * Actualiza una entrada existente en el catálogo
 * @param {Object} catalogData - Datos del catálogo
 * @returns {Object} - Entrada actualizada
 */
const updateCatalogEntry = async (catalogData) => {
  const {
    fileId,
    tableName,
    directory,
    originalFileName,
    originalFileSize,
    schema,
    rowCount,
    columnCount,
    s3Location,
    processingMetadata
  } = catalogData;

  try {
    logger.info('Actualizando entrada en catálogo', {
      fileId,
      tableName,
      directory
    });

    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        fileId: fileId
      },
      UpdateExpression: `
        SET 
          #status = :status,
          #rowCount = :rowCount,
          #columnCount = :columnCount,
          #s3Location = :s3Location,
          #processingMetadata = :processingMetadata,
          #processedAt = :processedAt,
          #updatedAt = :updatedAt
      `,
      ExpressionAttributeNames: {
        '#status': 'status',
        '#rowCount': 'rowCount',
        '#columnCount': 'columnCount',
        '#s3Location': 's3Location',
        '#processingMetadata': 'processingMetadata',
        '#processedAt': 'processedAt',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': 'processed',
        ':rowCount': rowCount,
        ':columnCount': columnCount,
        ':s3Location': s3Location,
        ':processingMetadata': processingMetadata,
        ':processedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(updateParams).promise();
    
    logger.info('Entrada actualizada exitosamente', {
      fileId,
      tableName,
      status: 'processed'
    });

    return result.Attributes;
  } catch (error) {
    logError(error, {
      fileId,
      tableName,
      operation: 'updateCatalogEntry'
    }, 'catalog-service');

    throw createError('DYNAMODB_ERROR', 
      `Error actualizando entrada en catálogo: ${error.message}`);
  }
};

/**
 * Actualiza el estado de procesamiento de una entrada
 * @param {string} fileId - ID del archivo
 * @param {string} status - Nuevo estado
 * @param {Object} errorInfo - Información del error (opcional)
 * @returns {Object} - Entrada actualizada
 */
const updateProcessingStatus = async (fileId, status, errorInfo = null) => {
  try {
    logger.info('Actualizando estado de procesamiento', {
      fileId,
      status
    });

    const updateExpression = `
      SET 
        #status = :status,
        #updatedAt = :updatedAt
    `;
    
    const expressionAttributeNames = {
      '#status': 'status',
      '#updatedAt': 'updatedAt'
    };
    
    const expressionAttributeValues = {
      ':status': status,
      ':updatedAt': new Date().toISOString()
    };

    // Si hay información de error, agregarla
    if (errorInfo) {
      updateExpression += ', #errorInfo = :errorInfo';
      expressionAttributeNames['#errorInfo'] = 'errorInfo';
      expressionAttributeValues[':errorInfo'] = errorInfo;
    }

    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        fileId: fileId
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(updateParams).promise();
    
    logger.info('Estado de procesamiento actualizado', {
      fileId,
      status
    });

    return result.Attributes;
  } catch (error) {
    logError(error, {
      fileId,
      status,
      operation: 'updateProcessingStatus'
    }, 'catalog-service');

    throw createError('DYNAMODB_ERROR', 
      `Error actualizando estado de procesamiento: ${error.message}`);
  }
};

/**
 * Obtiene una entrada del catálogo por fileId
 * @param {string} fileId - ID del archivo
 * @returns {Object} - Entrada del catálogo
 */
const getCatalogEntry = async (fileId) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: {
        fileId: fileId
      }
    };

    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      throw createError('NOT_FOUND', `Entrada no encontrada: ${fileId}`);
    }

    return result.Item;
  } catch (error) {
    logError(error, {
      fileId,
      operation: 'getCatalogEntry'
    }, 'catalog-service');

    throw error;
  }
};

/**
 * Obtiene todas las entradas de una tabla específica
 * @param {string} tableName - Nombre de la tabla
 * @returns {Array} - Lista de entradas
 */
const getCatalogEntriesByTable = async (tableName) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'tableName = :tableName',
      ExpressionAttributeValues: {
        ':tableName': tableName
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    return result.Items || [];
  } catch (error) {
    logError(error, {
      tableName,
      operation: 'getCatalogEntriesByTable'
    }, 'catalog-service');

    throw createError('DYNAMODB_ERROR', 
      `Error obteniendo entradas por tabla: ${error.message}`);
  }
};

/**
 * Obtiene todas las entradas del catálogo
 * @returns {Array} - Lista de todas las entradas
 */
const getAllCatalogEntries = async () => {
  try {
    const params = {
      TableName: TABLE_NAME
    };

    const result = await dynamodb.scan(params).promise();
    
    return result.Items || [];
  } catch (error) {
    logError(error, {
      operation: 'getAllCatalogEntries'
    }, 'catalog-service');

    throw createError('DYNAMODB_ERROR', 
      `Error obteniendo todas las entradas: ${error.message}`);
  }
};

/**
 * Elimina una entrada del catálogo
 * @param {string} fileId - ID del archivo
 * @returns {Object} - Resultado de la eliminación
 */
const deleteCatalogEntry = async (fileId) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: {
        fileId: fileId
      }
    };

    const result = await dynamodb.delete(params).promise();
    
    logger.info('Entrada eliminada del catálogo', {
      fileId
    });

    return result;
  } catch (error) {
    logError(error, {
      fileId,
      operation: 'deleteCatalogEntry'
    }, 'catalog-service');

    throw createError('DYNAMODB_ERROR', 
      `Error eliminando entrada del catálogo: ${error.message}`);
  }
};

module.exports = {
  updateCatalogEntry,
  updateProcessingStatus,
  getCatalogEntry,
  getCatalogEntriesByTable,
  getAllCatalogEntries,
  deleteCatalogEntry
}; 