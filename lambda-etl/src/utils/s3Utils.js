/**
 * Utilidades para operaciones con S3
 * @module lambda-etl/utils/s3Utils
 */

const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');

// Configurar cliente S3
const s3 = new AWS.S3();

/**
 * Obtiene metadatos de un objeto S3
 * @param {string} bucketName - Nombre del bucket
 * @param {string} objectKey - Clave del objeto
 * @returns {Object} - Metadatos del objeto
 */
const getObjectMetadata = async (bucketName, objectKey) => {
  try {
    logger.info('Obteniendo metadatos de objeto S3', {
      bucketName,
      objectKey
    });

    const params = {
      Bucket: bucketName,
      Key: objectKey
    };

    const result = await s3.headObject(params).promise();
    
    logger.info('Metadatos obtenidos exitosamente', {
      bucketName,
      objectKey,
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      lastModified: result.LastModified
    });

    return result;
  } catch (error) {
    logError(error, {
      bucketName,
      objectKey,
      operation: 'getObjectMetadata'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error obteniendo metadatos de S3: ${error.message}`);
  }
};

/**
 * Descarga un objeto S3 a un archivo temporal
 * @param {string} bucketName - Nombre del bucket
 * @param {string} objectKey - Clave del objeto
 * @returns {string} - Ruta del archivo temporal descargado
 */
const downloadObject = async (bucketName, objectKey) => {
  try {
    logger.info('Descargando objeto S3', {
      bucketName,
      objectKey
    });

    const params = {
      Bucket: bucketName,
      Key: objectKey
    };

    // Crear directorio temporal
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `s3_${Date.now()}_${path.basename(objectKey)}`);

    // Descargar archivo
    const fileStream = s3.getObject(params).createReadStream();
    const writeStream = fs.createWriteStream(tempFilePath);

    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      fileStream.on('error', reject);
    });

    // Verificar que el archivo se descargó correctamente
    const stats = await fs.stat(tempFilePath);
    
    logger.info('Objeto S3 descargado exitosamente', {
      bucketName,
      objectKey,
      tempFilePath,
      fileSize: stats.size
    });

    return tempFilePath;
  } catch (error) {
    logError(error, {
      bucketName,
      objectKey,
      operation: 'downloadObject'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error descargando objeto de S3: ${error.message}`);
  }
};

/**
 * Sube un archivo a S3
 * @param {string} bucketName - Nombre del bucket
 * @param {string} objectKey - Clave del objeto
 * @param {string} filePath - Ruta del archivo local
 * @param {Object} metadata - Metadatos adicionales (opcional)
 * @returns {Object} - Resultado de la subida
 */
const uploadObject = async (bucketName, objectKey, filePath, metadata = {}) => {
  try {
    logger.info('Subiendo archivo a S3', {
      bucketName,
      objectKey,
      filePath
    });

    // Verificar que el archivo existe
    if (!await fs.pathExists(filePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo no encontrado: ${filePath}`);
    }

    const fileContent = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    const params = {
      Bucket: bucketName,
      Key: objectKey,
      Body: fileContent,
      ContentType: getContentType(objectKey),
      Metadata: {
        ...metadata,
        'original-size': stats.size.toString(),
        'uploaded-at': new Date().toISOString()
      }
    };

    const result = await s3.upload(params).promise();
    
    logger.info('Archivo subido exitosamente a S3', {
      bucketName,
      objectKey,
      fileSize: stats.size,
      etag: result.ETag
    });

    return result;
  } catch (error) {
    logError(error, {
      bucketName,
      objectKey,
      filePath,
      operation: 'uploadObject'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error subiendo archivo a S3: ${error.message}`);
  }
};

/**
 * Lista objetos en un bucket con un prefijo específico
 * @param {string} bucketName - Nombre del bucket
 * @param {string} prefix - Prefijo para filtrar objetos
 * @param {number} maxKeys - Número máximo de objetos a retornar
 * @returns {Array} - Lista de objetos
 */
const listObjects = async (bucketName, prefix = '', maxKeys = 1000) => {
  try {
    logger.info('Listando objetos en S3', {
      bucketName,
      prefix,
      maxKeys
    });

    const params = {
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: maxKeys
    };

    const result = await s3.listObjectsV2(params).promise();
    
    logger.info('Objetos listados exitosamente', {
      bucketName,
      prefix,
      objectCount: result.Contents?.length || 0
    });

    return result.Contents || [];
  } catch (error) {
    logError(error, {
      bucketName,
      prefix,
      maxKeys,
      operation: 'listObjects'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error listando objetos en S3: ${error.message}`);
  }
};

/**
 * Elimina un objeto de S3
 * @param {string} bucketName - Nombre del bucket
 * @param {string} objectKey - Clave del objeto
 * @returns {Object} - Resultado de la eliminación
 */
const deleteObject = async (bucketName, objectKey) => {
  try {
    logger.info('Eliminando objeto de S3', {
      bucketName,
      objectKey
    });

    const params = {
      Bucket: bucketName,
      Key: objectKey
    };

    const result = await s3.deleteObject(params).promise();
    
    logger.info('Objeto eliminado exitosamente', {
      bucketName,
      objectKey
    });

    return result;
  } catch (error) {
    logError(error, {
      bucketName,
      objectKey,
      operation: 'deleteObject'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error eliminando objeto de S3: ${error.message}`);
  }
};

/**
 * Copia un objeto dentro de S3
 * @param {string} sourceBucket - Bucket de origen
 * @param {string} sourceKey - Clave del objeto de origen
 * @param {string} destinationBucket - Bucket de destino
 * @param {string} destinationKey - Clave del objeto de destino
 * @returns {Object} - Resultado de la copia
 */
const copyObject = async (sourceBucket, sourceKey, destinationBucket, destinationKey) => {
  try {
    logger.info('Copiando objeto en S3', {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey
    });

    const params = {
      Bucket: destinationBucket,
      Key: destinationKey,
      CopySource: `${sourceBucket}/${sourceKey}`
    };

    const result = await s3.copyObject(params).promise();
    
    logger.info('Objeto copiado exitosamente', {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey
    });

    return result;
  } catch (error) {
    logError(error, {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey,
      operation: 'copyObject'
    }, 's3-utils');

    throw createError('AWS_S3_ERROR', 
      `Error copiando objeto en S3: ${error.message}`);
  }
};

/**
 * Determina el tipo de contenido basado en la extensión del archivo
 * @param {string} objectKey - Clave del objeto
 * @returns {string} - Tipo de contenido MIME
 */
const getContentType = (objectKey) => {
  const ext = path.extname(objectKey).toLowerCase();
  
  const mimeTypes = {
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.parquet': 'application/octet-stream',
    '.txt': 'text/plain',
    '.log': 'text/plain'
  };

  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Verifica si un objeto existe en S3
 * @param {string} bucketName - Nombre del bucket
 * @param {string} objectKey - Clave del objeto
 * @returns {boolean} - True si el objeto existe
 */
const objectExists = async (bucketName, objectKey) => {
  try {
    await s3.headObject({
      Bucket: bucketName,
      Key: objectKey
    }).promise();
    
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

module.exports = {
  getObjectMetadata,
  downloadObject,
  uploadObject,
  listObjects,
  deleteObject,
  copyObject,
  getContentType,
  objectExists
}; 