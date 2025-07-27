/**
 * Manejador de eventos S3 para procesamiento ETL
 * @module lambda-etl/handlers/s3EventHandler
 */

const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const { isAllowedMimeType, isValidFileSize } = require('../../../shared/constants/fileTypes');
const CsvProcessor = require('../services/csvProcessor');
const ParquetConverter = require('../services/parquetConverter');
const CatalogService = require('../services/catalogService');
const S3Utils = require('../utils/s3Utils');
const FileUtils = require('../utils/fileUtils');

/**
 * Procesa un evento S3 individual
 * @param {Object} record - Registro S3 del evento
 * @param {Object} context - Contexto de ejecución Lambda
 * @returns {Object} - Resultado del procesamiento
 */
const processS3Event = async (record, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  // Extraer información del evento S3
  const { bucket, object } = record.s3;
  const bucketName = bucket.name;
  const objectKey = object.key;

  logger.info('Procesando evento S3', {
    requestId,
    bucketName,
    objectKey,
    eventName: record.eventName,
    eventTime: record.eventTime
  });

  try {
    // 1. Validar que sea un evento de creación de objeto
    if (!record.eventName.startsWith('ObjectCreated:')) {
      throw createError('VALIDATION_ERROR', 
        `Evento no soportado: ${record.eventName}. Solo se procesan eventos ObjectCreated`);
    }

    // 2. Validar que el bucket sea el correcto
    const expectedRawBucket = process.env.S3_BUCKET_RAW;
    if (bucketName !== expectedRawBucket) {
      throw createError('VALIDATION_ERROR', 
        `Bucket incorrecto: ${bucketName}. Se esperaba: ${expectedRawBucket}`);
    }

    // 3. Solo procesar archivos CSV, no esquemas JSON
    if (objectKey.endsWith('.json')) {
      logger.info('Ignorando archivo JSON (esquema)', {
        requestId,
        objectKey
      });
      return {
        skipped: true,
        reason: 'JSON schema file',
        objectKey
      };
    }

    // 4. Obtener metadatos del objeto S3
    const objectMetadata = await S3Utils.getObjectMetadata(bucketName, objectKey);
    
    logger.info('Metadatos del objeto obtenidos', {
      requestId,
      contentType: objectMetadata.ContentType,
      contentLength: objectMetadata.ContentLength,
      lastModified: objectMetadata.LastModified,
      metadata: objectMetadata.Metadata
    });

    // 5. Extraer información de metadatos
    const tableName = objectMetadata.Metadata['table-name'];
    const directory = objectMetadata.Metadata['directory'];
    const fileId = objectMetadata.Metadata['file-id'];
    const separator = objectMetadata.Metadata['separator'] || ',';

    if (!tableName || !directory || !fileId) {
      throw createError('VALIDATION_ERROR', 
        'Metadatos incompletos: faltan table-name, directory o file-id');
    }

    // 6. Validar tipo y tamaño del archivo
    if (!isAllowedMimeType(objectMetadata.ContentType)) {
      throw createError('INVALID_FILE_TYPE', 
        `Tipo de archivo no permitido: ${objectMetadata.ContentType}`);
    }

    if (!isValidFileSize(objectMetadata.ContentLength, objectMetadata.ContentType)) {
      throw createError('INVALID_FILE_SIZE', 
        `Tamaño de archivo excede el límite: ${objectMetadata.ContentLength} bytes`);
    }

    // 7. Descargar archivo CSV temporalmente
    const tempCsvPath = await S3Utils.downloadObject(bucketName, objectKey);
    
    logger.info('Archivo CSV descargado temporalmente', {
      requestId,
      tempCsvPath,
      fileSize: objectMetadata.ContentLength
    });

    // 8. Descargar esquema JSON correspondiente
    const schemaKey = objectKey.replace('.csv', '/schema.json');
    let schema;
    
    try {
      const tempSchemaPath = await S3Utils.downloadObject(bucketName, schemaKey);
      const schemaContent = await FileUtils.readFile(tempSchemaPath);
      schema = JSON.parse(schemaContent);
      
      logger.info('Esquema JSON descargado', {
        requestId,
        schemaKey,
        schemaFields: schema.schema.length
      });

      // Limpiar archivo temporal del esquema
      await FileUtils.cleanupTempFiles([tempSchemaPath]);
    } catch (schemaError) {
      logger.warn('No se pudo obtener el esquema JSON, generando automáticamente', {
        requestId,
        schemaKey,
        error: schemaError.message
      });
      
      // Generar esquema automáticamente si no existe
      const csvProcessingResult = await CsvProcessor.processCsvFile(tempCsvPath, objectKey);
      schema = {
        tableName: tableName,
        directory: directory,
        schema: csvProcessingResult.schema,
        fileId: fileId
      };
    }

    try {
      // 9. Procesar archivo CSV con el esquema
      const csvProcessingResult = await CsvProcessor.processCsvFileWithSchema(
        tempCsvPath, 
        objectKey, 
        schema.schema,
        separator
      );
      
      logger.info('Archivo CSV procesado con esquema', {
        requestId,
        rowCount: csvProcessingResult.rowCount,
        columnCount: csvProcessingResult.columnCount,
        schema: csvProcessingResult.schema
      });

      // 10. Convertir a Parquet
      const parquetKey = `${directory}/${fileId}/data.parquet`;
      const parquetResult = await ParquetConverter.convertToParquet(
        csvProcessingResult.data,
        csvProcessingResult.schema,
        parquetKey
      );

      logger.info('Conversión a Parquet completada', {
        requestId,
        parquetFilePath: parquetResult.filePath,
        parquetSize: parquetResult.fileSize,
        compressionRatio: parquetResult.compressionRatio
      });

      // 11. Subir archivo Parquet a bucket CURATED
      const curatedBucket = process.env.S3_BUCKET_CURATED;
      await S3Utils.uploadObject(curatedBucket, parquetKey, parquetResult.filePath);

      logger.info('Archivo Parquet subido a S3', {
        requestId,
        bucket: curatedBucket,
        key: parquetKey,
        fileId: fileId
      });

      // 12. Actualizar catálogo en DynamoDB
      const catalogEntry = await CatalogService.updateCatalogEntry({
        fileId: fileId,
        tableName: tableName,
        directory: directory,
        originalFileName: objectMetadata.Metadata['original-name'],
        originalFileSize: objectMetadata.ContentLength,
        parquetFileSize: parquetResult.fileSize,
        schema: schema.schema,
        rowCount: csvProcessingResult.rowCount,
        columnCount: csvProcessingResult.columnCount,
        s3Location: {
          rawBucket: bucketName,
          rawKey: objectKey,
          curatedBucket: curatedBucket,
          curatedKey: parquetKey
        },
        processingMetadata: {
          processingTime: Date.now() - startTime,
          requestId,
          lambdaMemorySize: context.memoryLimitInMB,
          lambdaTimeout: context.getRemainingTimeInMillis(),
          separator: separator
        }
      });

      logger.info('Dataset actualizado en DynamoDB', {
        requestId,
        fileId: fileId,
        tableName: tableName,
        status: 'processed'
      });

      // 13. Limpiar archivos temporales
      await FileUtils.cleanupTempFiles([tempCsvPath, parquetResult.filePath]);

      const totalProcessingTime = Date.now() - startTime;
      
      logger.info('Procesamiento ETL completado exitosamente', {
        requestId,
        fileId: fileId,
        tableName: tableName,
        totalProcessingTime,
        originalSize: objectMetadata.ContentLength,
        parquetSize: parquetResult.fileSize,
        compressionRatio: parquetResult.compressionRatio
      });

      return {
        fileId: fileId,
        tableName: tableName,
        processingTime: totalProcessingTime,
        originalSize: objectMetadata.ContentLength,
        parquetSize: parquetResult.fileSize,
        compressionRatio: parquetResult.compressionRatio,
        rowCount: csvProcessingResult.rowCount,
        columnCount: csvProcessingResult.columnCount,
        status: 'processed'
      };

    } catch (processingError) {
      // Limpiar archivos temporales en caso de error
      await FileUtils.cleanupTempFiles([tempCsvPath]);
      
      // Actualizar estado en DynamoDB como error
      await CatalogService.updateProcessingStatus(fileId, 'error', {
        error: processingError.message,
        requestId,
        processingTime: Date.now() - startTime
      });
      
      throw processingError;
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      bucketName,
      objectKey,
      processingTime
    }, 's3-event-handler');

    // Re-lanzar el error para que el manejador principal lo capture
    throw error;
  }
};

/**
 * Valida la estructura de un evento S3
 * @param {Object} record - Registro S3 a validar
 * @returns {boolean} - True si el evento es válido
 */
const validateS3Event = (record) => {
  if (!record || !record.s3) {
    return false;
  }

  const { bucket, object } = record.s3;
  if (!bucket || !bucket.name || !object || !object.key) {
    return false;
  }

  return true;
};

/**
 * Extrae información del evento S3
 * @param {Object} record - Registro S3
 * @returns {Object} - Información extraída
 */
const extractS3EventInfo = (record) => {
  if (!validateS3Event(record)) {
    throw createError('VALIDATION_ERROR', 'Estructura de evento S3 inválida');
  }

  return {
    bucketName: record.s3.bucket.name,
    objectKey: record.s3.object.key,
    eventName: record.eventName,
    eventTime: record.eventTime,
    eventSource: record.eventSource
  };
};

module.exports = {
  processS3Event,
  validateS3Event,
  extractS3EventInfo
}; 