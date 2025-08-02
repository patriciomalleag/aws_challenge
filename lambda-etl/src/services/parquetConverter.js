/**
 * Servicio de conversión de datos a formato Parquet
 * @module lambda-etl/services/parquetConverter
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const parquet = require('parquetjs');
const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const { PARQUET_COMPRESSION } = require('../../../shared/constants/fileTypes');

/**
 * Convierte datos CSV a formato Parquet real
 * @param {Array} data - Datos a convertir
 * @param {Array} schema - Esquema de los datos
 * @param {string} outputKey - Clave de salida para S3
 * @returns {Object} - Resultado de la conversión
 */
const convertToParquet = async (data, schema, outputKey) => {
  try {
    logger.info('Iniciando conversión real a Parquet', {
      dataLength: data.length,
      schemaFields: schema.length,
      outputKey
    });

    // Crear archivo temporal para Parquet
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `data_${Date.now()}.parquet`);

    // Validar datos contra esquema
    if (!validateDataAgainstSchema(data, schema)) {
      throw new Error('Los datos no son compatibles con el esquema');
    }

    // Optimizar esquema para Parquet
    const parquetSchema = optimizeSchemaForParquet(schema);

    // Crear writer de Parquet
    console.log('[PARQUET] Creando writer con esquema:', JSON.stringify(parquetSchema, null, 2));
    console.log('[PARQUET] Ruta temporal:', tempFilePath);
    
    const writer = await parquet.ParquetWriter.openFile(parquetSchema, tempFilePath, {
      compression: PARQUET_COMPRESSION.ALGORITHM,
      rowGroupSize: 10000 // Tamaño del grupo de filas
    });
    
    console.log('[PARQUET] Writer creado exitosamente');

    // Convertir y escribir datos
    console.log('[PARQUET] Iniciando escritura de', data.length, 'filas');
    let processedRows = 0;
    
    for (const row of data) {
      const parquetRow = {};
      
      // Convertir cada campo según el esquema
      for (const field of schema) {
        const value = row[field.name];
        parquetRow[field.name] = convertValueToParquetType(value, field.type);
      }
      
      // Log de la primera fila para debug
      if (processedRows === 0) {
        console.log('[PARQUET] Primera fila convertida:', JSON.stringify(parquetRow, null, 2));
      }
      
      await writer.appendRow(parquetRow);
      processedRows++;
      
      // Log progreso cada 1000 filas
      if (processedRows % 1000 === 0) {
        logger.info('Progreso de conversión', {
          processedRows,
          totalRows: data.length,
          percentage: Math.round((processedRows / data.length) * 100)
        });
      }
    }

    console.log('[PARQUET] Finalizando escritura. Filas procesadas:', processedRows);
    // Cerrar writer
    await writer.close();
    console.log('[PARQUET] Writer cerrado exitosamente');

    // Obtener estadísticas del archivo
    const stats = await fs.stat(tempFilePath);
    const originalSize = JSON.stringify(data).length;
    const compressionRatio = originalSize / stats.size;

    // Calcular estadísticas de los datos
    const dataStats = calculateDataStatistics(data, schema);

    logger.info('Conversión real a Parquet completada', {
      tempFilePath,
      fileSize: stats.size,
      originalSize,
      compressionRatio: compressionRatio.toFixed(2),
      processedRows,
      dataStats
    });

    return {
      filePath: tempFilePath,
      fileSize: stats.size,
      compressionRatio,
      datasetId: path.basename(outputKey, '.parquet'),
      metadata: {
        rowCount: data.length,
        columnCount: schema.length,
        compression: PARQUET_COMPRESSION.ALGORITHM,
        createdAt: new Date().toISOString(),
        source: 'csv-conversion',
        statistics: dataStats
      }
    };

  } catch (error) {
    logError(error, {
      dataLength: data?.length,
      schemaFields: schema?.length,
      outputKey,
      operation: 'convertToParquet'
    }, 'parquet-converter');

    throw createError('PARQUET_CONVERSION_ERROR', 
      `Error en conversión a Parquet: ${error.message}`);
  }
};

/**
 * Convierte un valor al tipo apropiado para Parquet
 * @param {*} value - Valor a convertir
 * @param {string} type - Tipo de datos
 * @returns {*} - Valor convertido
 */
const convertValueToParquetType = (value, type) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (type) {
    case 'string':
      return String(value);
    
    case 'integer':
      const intValue = parseInt(value, 10);
      return isNaN(intValue) ? null : intValue;
    
    case 'float':
      const floatValue = parseFloat(value);
      return isNaN(floatValue) ? null : floatValue;
    
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
      }
      return Boolean(value);
    
    case 'date':
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') {
        const dateValue = new Date(value);
        return isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
      }
      return null;
    
    default:
      return String(value);
  }
};

/**
 * Valida que los datos sean compatibles con el esquema
 * @param {Array} data - Datos a validar
 * @param {Array} schema - Esquema de validación
 * @returns {boolean} - True si los datos son válidos
 */
const validateDataAgainstSchema = (data, schema) => {
  if (!Array.isArray(data) || !Array.isArray(schema)) {
    return false;
  }

  if (data.length === 0) {
    return true; // Datos vacíos son válidos
  }

  const schemaMap = new Map(schema.map(field => [field.name, field]));
  const sampleRow = data[0];

  // Verificar que todos los campos del esquema estén presentes
  for (const field of schema) {
    if (!(field.name in sampleRow)) {
      logger.warn('Campo faltante en datos', {
        fieldName: field.name,
        availableFields: Object.keys(sampleRow)
      });
      return false;
    }
  }

  return true;
};

/**
 * Optimiza el esquema para Parquet
 * @param {Array} schema - Esquema original
 * @returns {Object} - Esquema optimizado para parquetjs
 */
const optimizeSchemaForParquet = (schema) => {
  const parquetSchema = {};
  
  for (const field of schema) {
    parquetSchema[field.name] = {
      type: mapToParquetType(field.type),
      optional: field.nullable !== false,
      compression: PARQUET_COMPRESSION.ALGORITHM
    };
  }
  
  return parquetSchema;
};

/**
 * Mapea tipos de datos a tipos Parquet
 * @param {string} dataType - Tipo de datos
 * @returns {string} - Tipo Parquet correspondiente
 */
const mapToParquetType = (dataType) => {
  const typeMapping = {
    'string': 'UTF8',
    'integer': 'INT64',
    'float': 'DOUBLE',
    'boolean': 'BOOLEAN',
    'date': 'UTF8' // Parquetjs no tiene tipo DATE nativo, usamos UTF8 para ISO strings
  };

  return typeMapping[dataType] || 'UTF8';
};

/**
 * Calcula estadísticas de los datos
 * @param {Array} data - Datos a analizar
 * @param {Array} schema - Esquema de los datos
 * @returns {Object} - Estadísticas calculadas
 */
const calculateDataStatistics = (data, schema) => {
  if (!data || data.length === 0) {
    return {
      rowCount: 0,
      columnCount: schema.length,
      nullCounts: {},
      valueRanges: {}
    };
  }

  const stats = {
    rowCount: data.length,
    columnCount: schema.length,
    nullCounts: {},
    valueRanges: {}
  };

  // Inicializar contadores
  for (const field of schema) {
    stats.nullCounts[field.name] = 0;
    stats.valueRanges[field.name] = {
      min: null,
      max: null,
      uniqueValues: new Set()
    };
  }

  // Calcular estadísticas
  for (const row of data) {
    for (const field of schema) {
      const value = row[field.name];
      
      if (value === null || value === undefined || value === '') {
        stats.nullCounts[field.name]++;
      } else {
        stats.valueRanges[field.name].uniqueValues.add(value);
        
        // Calcular min/max para tipos numéricos
        if (field.type === 'integer' || field.type === 'float') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            const range = stats.valueRanges[field.name];
            if (range.min === null || numValue < range.min) {
              range.min = numValue;
            }
            if (range.max === null || numValue > range.max) {
              range.max = numValue;
            }
          }
        }
      }
    }
  }

  // Convertir Sets a arrays para serialización
  for (const field of schema) {
    stats.valueRanges[field.name].uniqueValues = 
      Array.from(stats.valueRanges[field.name].uniqueValues).slice(0, 10); // Limitar a 10 valores únicos
  }

  return stats;
};

/**
 * Lee un archivo Parquet y retorna los datos
 * @param {string} filePath - Ruta del archivo Parquet
 * @returns {Array} - Datos del archivo Parquet
 */
const readParquetFile = async (filePath) => {
  try {
    logger.info('Leyendo archivo Parquet', { filePath });
    
    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();
    
    const data = [];
    let row;
    
    while (row = await cursor.next()) {
      data.push(row);
    }
    
    await reader.close();
    
    logger.info('Archivo Parquet leído exitosamente', {
      filePath,
      rowCount: data.length
    });
    
    return data;
    
  } catch (error) {
    logError(error, { filePath, operation: 'readParquetFile' }, 'parquet-converter');
    throw createError('PARQUET_READ_ERROR', 
      `Error leyendo archivo Parquet: ${error.message}`);
  }
};

module.exports = {
  convertToParquet,
  validateDataAgainstSchema,
  optimizeSchemaForParquet,
  mapToParquetType,
  calculateDataStatistics,
  readParquetFile
}; 