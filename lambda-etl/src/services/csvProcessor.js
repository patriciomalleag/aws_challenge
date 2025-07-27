/**
 * Servicio de procesamiento de archivos CSV
 * @module lambda-etl/services/csvProcessor
 */

const fs = require('fs-extra');
const csv = require('csv-parser');
const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const { isValidFileSize } = require('../../../shared/constants/fileTypes');

/**
 * Procesa un archivo CSV y extrae su esquema automáticamente
 * @param {string} filePath - Ruta al archivo CSV
 * @param {string} objectKey - Clave del objeto S3
 * @returns {Object} - Resultado del procesamiento
 */
const processCsvFile = async (filePath, objectKey) => {
  try {
    logger.info('Iniciando procesamiento de archivo CSV', {
      filePath,
      objectKey
    });

    // Verificar que el archivo existe
    if (!await fs.pathExists(filePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo no encontrado: ${filePath}`);
    }

    // Obtener estadísticas del archivo
    const stats = await fs.stat(filePath);
    
    if (!isValidFileSize(stats.size, 'text/csv')) {
      throw createError('INVALID_FILE_SIZE', 
        `Archivo demasiado grande: ${stats.size} bytes`);
    }

    const results = [];
    const schema = new Map();
    let rowCount = 0;
    let columnCount = 0;

    // Leer y analizar el archivo CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          results.push(row);
          rowCount++;

          // Analizar esquema en las primeras filas
          if (rowCount <= 100) {
            for (const [key, value] of Object.entries(row)) {
              if (!schema.has(key)) {
                schema.set(key, {
                  name: key,
                  type: inferDataType(value),
                  nullable: value === '' || value === null || value === undefined,
                  sampleValues: [value]
                });
              } else {
                const field = schema.get(key);
                field.type = inferDataType(value, field.type);
                field.nullable = field.nullable || (value === '' || value === null || value === undefined);
                if (field.sampleValues.length < 5) {
                  field.sampleValues.push(value);
                }
              }
            }
          }

          // Limitar el número de filas para análisis
          if (rowCount > 1000) {
            this.destroy();
            resolve();
          }
        })
        .on('end', () => {
          columnCount = schema.size;
          resolve();
        })
        .on('error', (error) => {
          reject(createError('FILE_PROCESSING_FAILED', 
            `Error procesando CSV: ${error.message}`));
        });
    });

    const schemaArray = Array.from(schema.values()).map(field => ({
      name: field.name,
      type: field.type,
      nullable: field.nullable,
      description: `Campo ${field.name} de tipo ${field.type}`
    }));

    logger.info('Procesamiento CSV completado', {
      filePath,
      rowCount,
      columnCount,
      schemaFields: schemaArray.length
    });

    return {
      data: results,
      schema: schemaArray,
      rowCount,
      columnCount,
      fileSize: stats.size
    };

  } catch (error) {
    logError(error, {
      filePath,
      objectKey,
      operation: 'processCsvFile'
    }, 'csv-processor');

    throw error;
  }
};

/**
 * Procesa un archivo CSV con un esquema predefinido
 * @param {string} filePath - Ruta al archivo CSV
 * @param {string} objectKey - Clave del objeto S3
 * @param {Array} schema - Esquema predefinido
 * @param {string} separator - Separador de campos
 * @returns {Object} - Resultado del procesamiento
 */
const processCsvFileWithSchema = async (filePath, objectKey, schema, separator = ',') => {
  try {
    logger.info('Iniciando procesamiento CSV con esquema', {
      filePath,
      objectKey,
      schemaFields: schema.length,
      separator
    });

    // Verificar que el archivo existe
    if (!await fs.pathExists(filePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo no encontrado: ${filePath}`);
    }

    // Obtener estadísticas del archivo
    const stats = await fs.stat(filePath);
    
    if (!isValidFileSize(stats.size, 'text/csv')) {
      throw createError('INVALID_FILE_SIZE', 
        `Archivo demasiado grande: ${stats.size} bytes`);
    }

    const results = [];
    let rowCount = 0;
    const columnCount = schema.length;

    // Crear mapa de esquema para validación rápida
    const schemaMap = new Map(schema.map(field => [field.name, field]));

    // Leer y procesar el archivo CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ separator }))
        .on('data', (row) => {
          // Validar y transformar datos según el esquema
          const processedRow = {};
          
          for (const field of schema) {
            const value = row[field.name];
            
            // Aplicar transformaciones según el tipo
            processedRow[field.name] = transformValue(value, field.type);
          }

          results.push(processedRow);
          rowCount++;

          // Limitar el número de filas para procesamiento
          if (rowCount > 10000) {
            this.destroy();
            resolve();
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(createError('FILE_PROCESSING_FAILED', 
            `Error procesando CSV: ${error.message}`));
        });
    });

    logger.info('Procesamiento CSV con esquema completado', {
      filePath,
      rowCount,
      columnCount
    });

    return {
      data: results,
      schema: schema,
      rowCount,
      columnCount,
      fileSize: stats.size
    };

  } catch (error) {
    logError(error, {
      filePath,
      objectKey,
      schema,
      separator,
      operation: 'processCsvFileWithSchema'
    }, 'csv-processor');

    throw error;
  }
};

/**
 * Infiere el tipo de datos de un valor
 * @param {*} value - Valor a analizar
 * @param {string} currentType - Tipo actual (para refinamiento)
 * @returns {string} - Tipo de datos inferido
 */
const inferDataType = (value, currentType = 'string') => {
  if (!value || value === '') {
    return currentType;
  }

  // Si ya es un tipo más específico, mantenerlo
  if (currentType !== 'string') {
    return currentType;
  }

  // Verificar si es número
  if (!isNaN(value) && value !== '') {
    if (value.includes('.')) {
      return 'float';
    } else {
      return 'integer';
    }
  }

  // Verificar si es fecha
  const dateRegex = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}$/;
  if (dateRegex.test(value)) {
    return 'date';
  }

  // Verificar si es booleano
  if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
    return 'boolean';
  }

  return 'string';
};

/**
 * Transforma un valor según el tipo de datos especificado
 * @param {*} value - Valor a transformar
 * @param {string} type - Tipo de datos objetivo
 * @returns {*} - Valor transformado
 */
const transformValue = (value, type) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (type) {
    case 'integer':
      const intValue = parseInt(value, 10);
      return isNaN(intValue) ? null : intValue;
    
    case 'float':
      const floatValue = parseFloat(value);
      return isNaN(floatValue) ? null : floatValue;
    
    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1';
    
    case 'date':
      // Intentar parsear diferentes formatos de fecha
      const dateValue = new Date(value);
      return isNaN(dateValue.getTime()) ? value : dateValue.toISOString();
    
    default:
      return value;
  }
};

/**
 * Valida un esquema CSV
 * @param {Array} schema - Esquema a validar
 * @returns {boolean} - True si el esquema es válido
 */
const validateSchema = (schema) => {
  if (!Array.isArray(schema)) {
    return false;
  }

  for (const field of schema) {
    if (!field.name || !field.type) {
      return false;
    }

    const validTypes = ['string', 'integer', 'float', 'boolean', 'date'];
    if (!validTypes.includes(field.type)) {
      return false;
    }
  }

  return true;
};

module.exports = {
  processCsvFile,
  processCsvFileWithSchema,
  inferDataType,
  transformValue,
  validateSchema
}; 