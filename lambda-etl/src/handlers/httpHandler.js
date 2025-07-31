/**
 * Manejador HTTP para la función Lambda ETL
 * Procesa requests HTTP para procesamiento ETL de archivos CSV a Parquet
 * @module lambda-etl/handlers/httpHandler
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const { isAllowedMimeType, isValidFileSize } = require('../../../shared/constants/fileTypes');
const CsvProcessor = require('../services/csvProcessor');
const ParquetConverter = require('../services/parquetConverter');
const CatalogService = require('../services/catalogService');
const S3Utils = require('../utils/s3Utils');
const FileUtils = require('../utils/fileUtils');

/**
 * Inicializar servicios
 */
exports.initialize = async () => {
  try {
    logger.info('HTTP Handler ETL inicializado correctamente');
  } catch (error) {
    logger.error('Error inicializando HTTP Handler ETL', { error: error.message });
    throw error;
  }
};

/**
 * Limpiar recursos
 */
exports.cleanup = async () => {
  try {
    logger.info('HTTP Handler ETL limpiado correctamente');
  } catch (error) {
    logger.error('Error limpiando HTTP Handler ETL', { error: error.message });
  }
};

/**
 * Manejar request de procesamiento ETL
 * @param {Object} event - Evento HTTP
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Respuesta HTTP
 */
exports.handleProcessRequest = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  try {
    // Parsear body del request
    const body = JSON.parse(event.body || '{}');
    const { fileId, bucketName, objectKey, tableName, directory } = body;

    // Validar parámetros requeridos
    if (!fileId) {
      throw createError('VALIDATION_ERROR', 'fileId es requerido');
    }
    
    if (!bucketName) {
      throw createError('VALIDATION_ERROR', 'bucketName es requerido');
    }
    
    if (!objectKey) {
      throw createError('VALIDATION_ERROR', 'objectKey es requerido');
    }

    logger.info('Iniciando procesamiento ETL via HTTP', {
      requestId,
      fileId,
      bucketName,
      objectKey,
      tableName,
      directory
    });

    // Procesar archivo usando la lógica existente adaptada
    const result = await processFileForETL({
      fileId,
      bucketName,
      objectKey,
      tableName,
      directory
    }, context);
    
    const processingTime = Date.now() - startTime;
    
    logPerformance('ETL_HTTP_PROCESSING', processingTime, {
      requestId,
      fileId,
      tableName,
      originalSize: result.originalSize,
      parquetSize: result.parquetSize,
      rowCount: result.rowCount
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: {
          fileId: result.fileId,
          tableName: result.tableName,
          processingTime: processingTime,
          originalSize: result.originalSize,
          parquetSize: result.parquetSize,
          compressionRatio: result.compressionRatio,
          rowCount: result.rowCount,
          columnCount: result.columnCount,
          status: result.status
        },
        requestId
      })
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logError(error, {
      requestId,
      processingTime,
      body: event.body
    }, 'httpHandler-etl');

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
 * Procesar archivo para ETL - Lógica adaptada de s3EventHandler
 * @param {Object} params - Parámetros del archivo
 * @param {Object} context - Contexto Lambda
 * @returns {Object} - Resultado del procesamiento
 */
const processFileForETL = async (params, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;
  const { fileId, bucketName, objectKey, tableName, directory } = params;

  logger.info('Procesando archivo para ETL', {
    requestId,
    fileId,
    bucketName,
    objectKey,
    tableName,
    directory
  });

  try {
    // 1. Validar que el bucket sea el correcto
    const expectedRawBucket = process.env.S3_BUCKET_RAW;
    if (bucketName !== expectedRawBucket) {
      throw createError('VALIDATION_ERROR', 
        `Bucket incorrecto: ${bucketName}. Se esperaba: ${expectedRawBucket}`);
    }

    // 2. Solo procesar archivos CSV, no esquemas JSON
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

    // 3. Obtener metadatos del objeto S3
    const objectMetadata = await S3Utils.getObjectMetadata(bucketName, objectKey);
    
    logger.info('Metadatos del objeto obtenidos', {
      requestId,
      contentType: objectMetadata.ContentType,
      contentLength: objectMetadata.ContentLength,
      lastModified: objectMetadata.LastModified,
      metadata: objectMetadata.Metadata
    });

    // 4. Extraer información de metadatos (con fallbacks de parámetros HTTP)
    const metaTableName = objectMetadata.Metadata['table-name'] || tableName;
    const metaDirectory = objectMetadata.Metadata['directory'] || directory;
    const metaFileId = objectMetadata.Metadata['file-id'] || fileId;
    const separator = objectMetadata.Metadata['separator'] || ',';

    if (!metaTableName || !metaDirectory || !metaFileId) {
      throw createError('VALIDATION_ERROR', 
        'Información incompleta: faltan table-name, directory o file-id');
    }

    // 5. Validar tipo y tamaño del archivo
    if (!isAllowedMimeType(objectMetadata.ContentType)) {
      throw createError('INVALID_FILE_TYPE', 
        `Tipo de archivo no permitido: ${objectMetadata.ContentType}`);
    }

    if (!isValidFileSize(objectMetadata.ContentLength, objectMetadata.ContentType)) {
      throw createError('INVALID_FILE_SIZE', 
        `Tamaño de archivo excede el límite: ${objectMetadata.ContentLength} bytes`);
    }

    // 6. Descargar archivo CSV temporalmente
    const tempCsvPath = await S3Utils.downloadObject(bucketName, objectKey);
    
    logger.info('Archivo CSV descargado temporalmente', {
      requestId,
      tempCsvPath,
      fileSize: objectMetadata.ContentLength
    });

    // 7. Descargar esquema JSON correspondiente
    const schemaKey = objectKey.replace(/\/[^\/]+\.csv$/, '/schema.json');
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
        tableName: metaTableName,
        directory: metaDirectory,
        schema: csvProcessingResult.schema,
        fileId: metaFileId
      };
    }

    try {
      // 8. Procesar archivo CSV con el esquema
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

      // 9. Convertir a Parquet
      const parquetKey = `${metaDirectory}/${metaFileId}/data.parquet`;
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

      // 10. Subir archivo Parquet a bucket CURATED
      const curatedBucket = process.env.S3_BUCKET_CURATED;
      await S3Utils.uploadObject(curatedBucket, parquetKey, parquetResult.filePath);

      logger.info('Archivo Parquet subido a S3', {
        requestId,
        bucket: curatedBucket,
        key: parquetKey,
        fileId: metaFileId
      });

      // 11. Actualizar catálogo en DynamoDB
      const catalogEntry = await CatalogService.updateCatalogEntry({
        fileId: metaFileId,
        tableName: metaTableName,
        directory: metaDirectory,
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
        fileId: metaFileId,
        tableName: metaTableName,
        status: 'processed'
      });

      // 12. Limpiar archivos temporales
      await FileUtils.cleanupTempFiles([tempCsvPath, parquetResult.filePath]);

      const totalProcessingTime = Date.now() - startTime;
      
      logger.info('Procesamiento ETL completado exitosamente', {
        requestId,
        fileId: metaFileId,
        tableName: metaTableName,
        totalProcessingTime,
        originalSize: objectMetadata.ContentLength,
        parquetSize: parquetResult.fileSize,
        compressionRatio: parquetResult.compressionRatio
      });

      return {
        fileId: metaFileId,
        tableName: metaTableName,
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
      await CatalogService.updateProcessingStatus(metaFileId, 'error', {
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
      fileId,
      bucketName,
      objectKey,
      processingTime
    }, 'etl-http-processing');

    // Re-lanzar el error para que el manejador principal lo capture
    throw error;
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
    // Verificar variables de entorno requeridas
    const requiredEnvVars = [
      'S3_BUCKET_RAW',
      'S3_BUCKET_CURATED',
      'DDB_TABLE_NAME'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    const healthStatus = {
      status: missingVars.length === 0 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      requestId,
      environment: {
        missingVars: missingVars.length > 0 ? missingVars : undefined,
        buckets: {
          raw: process.env.S3_BUCKET_RAW,
          curated: process.env.S3_BUCKET_CURATED
        },
        dynamodb: process.env.DDB_TABLE_NAME
      }
    };

    return {
      statusCode: missingVars.length === 0 ? 200 : 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(healthStatus)
    };

  } catch (error) {
    logError(error, {
      requestId
    }, 'httpHandler-etl');

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