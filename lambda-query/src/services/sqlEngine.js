/**
 * Motor SQL para consultar archivos CSV
 * Utiliza SQLite para ejecutar consultas SQL sobre archivos CSV
 * @module lambda-query/services/sqlEngine
 */

const { logger, logError, logPerformance } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');
const AWS = require('aws-sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const csv = require('csv-parser');
const stream = require('stream');
const { promisify } = require('util');

// Configuración de AWS
const s3 = new AWS.S3();

// Variables de entorno
const RAW_BUCKET = process.env.S3_BUCKET_RAW;
const MAX_QUERY_TIMEOUT_MS = parseInt(process.env.MAX_QUERY_TIMEOUT_MS) || 30000;
const MAX_RESULT_ROWS = parseInt(process.env.MAX_RESULT_ROWS) || 1000;

/**
 * Clase para manejar consultas SQL sobre archivos CSV
 */
class SQLEngine {
  constructor() {
    this.db = null;
    this.tempDir = null;
  }

  /**
   * Inicializar el motor SQL
   */
  async initialize() {
    try {
      // Crear directorio temporal para SQLite
      this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-'));
      const dbPath = path.join(this.tempDir, 'query.db');
      
      // Crear base de datos SQLite en memoria
      this.db = new sqlite3.Database(':memory:');
      
      logger.info('Motor SQL inicializado', {
        tempDir: this.tempDir,
        dbPath: dbPath
      });
    } catch (error) {
      logger.error('Error inicializando motor SQL', { error: error.message });
      throw error;
    }
  }

  /**
   * Limpiar recursos
   */
  async cleanup() {
    try {
      if (this.db) {
        await this.closeDatabase();
      }
      
      if (this.tempDir) {
        await this.cleanupTempDir();
      }
      
      logger.info('Motor SQL limpiado correctamente');
    } catch (error) {
      logger.warn('Error limpiando motor SQL', { error: error.message });
    }
  }

  /**
   * Ejecutar consulta SQL sobre archivos CSV
   * @param {string} query - Consulta SQL
   * @param {Array} csvFiles - Lista de archivos CSV
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   * @returns {Array} - Resultados de la consulta
   */
  async executeQuery(query, csvFiles, tableName, requestId) {
    const startTime = Date.now();
    
    try {
      logger.info('Ejecutando consulta SQL real', {
        requestId,
        tableName,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        csvFilesCount: csvFiles.length
      });

      // 1. Descargar archivos CSV desde S3
      const localFiles = await this.downloadCsvFiles(csvFiles, requestId);
      
      // 2. Crear tabla en SQLite e importar CSV
      await this.importCsvFiles(localFiles, tableName, requestId);
      
      // 3. Ejecutar consulta SQL
      const results = await this.runSQLQuery(query, requestId);
      
      // 4. Limpiar archivos temporales
      await this.cleanupLocalFiles(localFiles);

      const processingTime = Date.now() - startTime;
      
      logPerformance('SQL_QUERY_EXECUTION', processingTime, {
        requestId,
        tableName,
        csvFilesCount: csvFiles.length,
        resultRows: results.length
      });

      logger.info('Consulta SQL ejecutada exitosamente', {
        requestId,
        processingTime,
        resultRows: results.length
      });

      return results;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logError(error, {
        requestId,
        tableName,
        query: query.substring(0, 100),
        processingTime
      }, 'sqlEngine');

      throw error;
    }
  }

    /**
   * Descargar archivos CSV desde S3
   * @param {Array} csvFiles - Lista de archivos CSV
   * @param {string} requestId - ID de la request
   * @returns {Array} - Lista de archivos locales
   */
  async downloadCsvFiles(csvFiles, requestId) {
    const localFiles = [];
    
    for (const file of csvFiles) {
      try {
        const localPath = path.join(this.tempDir, path.basename(file.key));
        
        const params = {
          Bucket: RAW_BUCKET,
          Key: file.key
        };
        
        logger.debug('Descargando archivo CSV', {
          requestId,
          bucket: RAW_BUCKET,
          key: file.key,
          size: file.size
        });

        // Obtener el objeto desde S3
        const s3Object = await s3.getObject(params).promise();
        
        // Guardar en disco local
        await fs.writeFile(localPath, s3Object.Body);
        
        localFiles.push({
          originalKey: file.key,
          localPath,
          size: file.size
        });
        
        logger.debug('Archivo CSV descargado', {
          requestId,
          localPath,
          size: s3Object.ContentLength
        });
        
      } catch (error) {
        logger.warn('Error descargando archivo CSV', {
          requestId,
          key: file.key,
          error: error.message
        });
      }
    }
    
    logger.info('Archivos CSV descargados', {
      requestId,
      count: localFiles.length,
      totalSize: localFiles.reduce((sum, file) => sum + file.size, 0)
    });
    
    return localFiles;
  }

  /**
   * Importar archivos CSV a SQLite
   * @param {Array} localFiles - Lista de archivos locales
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   */
  async importCsvFiles(localFiles, tableName, requestId) {
    try {
      if (localFiles.length === 0) {
        throw createError('VALIDATION_ERROR', 'No hay archivos CSV para procesar');
      }

      logger.info('Iniciando importación de archivos CSV', {
        requestId,
        tableName,
        fileCount: localFiles.length
      });

      // 1. Leer el primer archivo para determinar la estructura
      const firstFile = localFiles[0];
      const schema = await this.inferCsvSchema(firstFile.localPath, requestId);
      
      // 2. Crear tabla en SQLite
      await this.createTableFromSchema(tableName, schema, requestId);
      
      // 3. Importar todos los archivos CSV
      for (const file of localFiles) {
        await this.importSingleCsvFile(file.localPath, tableName, requestId);
      }

      logger.info('Importación de archivos CSV completada', {
        requestId,
        tableName,
        fileCount: localFiles.length
      });

    } catch (error) {
      logger.error('Error importando archivos CSV', {
        requestId,
        tableName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Inferir esquema de un archivo CSV
   * @param {string} csvPath - Ruta del archivo CSV
   * @param {string} requestId - ID de la request
   * @returns {Array} - Esquema del CSV
   */
  async inferCsvSchema(csvPath, requestId) {
    return new Promise((resolve, reject) => {
      const schema = [];
      const sampleRows = [];
      let isFirstRow = true;
      
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          if (isFirstRow) {
            // Obtener nombres de columnas
            const columnNames = Object.keys(row);
            columnNames.forEach(colName => {
              schema.push({
                name: colName.trim(),
                type: 'TEXT', // Por defecto TEXT, se inferirá más adelante
                nullable: true
              });
            });
            isFirstRow = false;
          }
          
          // Tomar muestra de las primeras 100 filas para inferir tipos
          if (sampleRows.length < 100) {
            sampleRows.push(row);
          }
        })
        .on('end', () => {
          // Inferir tipos de datos basado en la muestra
          this.inferColumnTypes(schema, sampleRows);
          
          logger.debug('Esquema CSV inferido', {
            requestId,
            csvPath,
            columnCount: schema.length,
            sampleRows: sampleRows.length
          });
          
          resolve(schema);
        })
        .on('error', (error) => {
          logger.error('Error leyendo CSV para inferir esquema', {
            requestId,
            csvPath,
            error: error.message
          });
          reject(error);
        });
    });
  }

  /**
   * Inferir tipos de columnas basado en datos de muestra
   * @param {Array} schema - Esquema base
   * @param {Array} sampleRows - Filas de muestra
   */
  inferColumnTypes(schema, sampleRows) {
    schema.forEach(column => {
      const values = sampleRows.map(row => row[column.name]);
      const nonEmptyValues = values.filter(val => val !== null && val !== undefined && val !== '');
      
      if (nonEmptyValues.length === 0) {
        column.type = 'TEXT';
        return;
      }

      // Verificar si todos los valores son números enteros
      const isInteger = nonEmptyValues.every(val => {
        const num = parseInt(val, 10);
        return !isNaN(num) && num.toString() === val.toString().trim();
      });

      if (isInteger) {
        column.type = 'INTEGER';
        return;
      }

      // Verificar si todos los valores son números decimales
      const isFloat = nonEmptyValues.every(val => {
        const num = parseFloat(val);
        return !isNaN(num) && isFinite(num);
      });

      if (isFloat) {
        column.type = 'REAL';
        return;
      }

      // Verificar si son valores booleanos
      const isBool = nonEmptyValues.every(val => {
        const lowerVal = val.toString().toLowerCase().trim();
        return ['true', 'false', '1', '0', 'yes', 'no'].includes(lowerVal);
      });

      if (isBool) {
        column.type = 'INTEGER'; // SQLite usa INTEGER para booleanos
        return;
      }

      // Por defecto, usar TEXT
      column.type = 'TEXT';
    });
  }

  /**
   * Crear tabla SQLite basada en esquema CSV
   * @param {string} tableName - Nombre de la tabla
   * @param {Array} schema - Esquema del CSV
   * @param {string} requestId - ID de la request
   */
  async createTableFromSchema(tableName, schema, requestId) {
    return new Promise((resolve, reject) => {
      const columns = schema.map(col => `"${col.name}" ${col.type}`);
      const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns.join(', ')})`;
      
      logger.debug('Creando tabla SQLite', {
        requestId,
        tableName,
        columnCount: schema.length,
        sql: createTableSQL.substring(0, 200) + '...'
      });

      this.db.run(createTableSQL, (err) => {
        if (err) {
          logger.error('Error creando tabla SQLite', {
            requestId,
            tableName,
            error: err.message
          });
          reject(createError('DATABASE_ERROR', `Error creando tabla: ${err.message}`));
          return;
        }

        logger.info('Tabla SQLite creada exitosamente', {
          requestId,
          tableName,
          columnCount: schema.length
        });
        
        resolve();
      });
    });
  }

  /**
   * Importar un archivo CSV individual a SQLite
   * @param {string} csvPath - Ruta del archivo CSV
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   */
  async importSingleCsvFile(csvPath, tableName, requestId) {
    return new Promise((resolve, reject) => {
      let insertedRows = 0;
      let hasError = false;
      
      // Obtener columnas de la tabla
      this.db.all(`PRAGMA table_info("${tableName}")`, (err, columns) => {
        if (err) {
          reject(createError('DATABASE_ERROR', `Error obteniendo info de tabla: ${err.message}`));
          return;
        }

        const columnNames = columns.map(col => col.name);
        const placeholders = columnNames.map(() => '?').join(', ');
        const insertSQL = `INSERT INTO "${tableName}" (${columnNames.map(name => `"${name}"`).join(', ')}) VALUES (${placeholders})`;
        
        const stmt = this.db.prepare(insertSQL, (prepareErr) => {
          if (prepareErr) {
            reject(createError('DATABASE_ERROR', `Error preparando statement: ${prepareErr.message}`));
            return;
          }

          logger.debug('Iniciando importación de archivo CSV', {
            requestId,
            csvPath,
            tableName,
            columnCount: columnNames.length
          });

          // Leer y procesar archivo CSV
          fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => {
              if (hasError) return;

              try {
                const values = columnNames.map(colName => {
                  const value = row[colName];
                  return value === undefined || value === '' ? null : value;
                });

                stmt.run(values, (runErr) => {
                  if (runErr && !hasError) {
                    hasError = true;
                    stmt.finalize();
                    reject(createError('DATABASE_ERROR', `Error insertando fila: ${runErr.message}`));
                  }
                });
                
                insertedRows++;
              } catch (error) {
                if (!hasError) {
                  hasError = true;
                  stmt.finalize();
                  reject(createError('CSV_PROCESSING_ERROR', `Error procesando fila: ${error.message}`));
                }
              }
            })
            .on('end', () => {
              if (hasError) return;

              stmt.finalize((finalizeErr) => {
                if (finalizeErr) {
                  reject(createError('DATABASE_ERROR', `Error finalizando statement: ${finalizeErr.message}`));
                } else {
                  logger.info('Archivo CSV importado exitosamente', {
                    requestId,
                    csvPath,
                    tableName,
                    insertedRows
                  });
                  resolve(insertedRows);
                }
              });
            })
            .on('error', (streamErr) => {
              if (!hasError) {
                hasError = true;
                stmt.finalize();
                reject(createError('CSV_PROCESSING_ERROR', `Error leyendo archivo CSV: ${streamErr.message}`));
              }
            });
        });
      });
    });
  }

  /**
   * Ejecutar consulta SQL
   * @param {string} query - Consulta SQL
   * @param {string} requestId - ID de la request
   * @returns {Array} - Resultados de la consulta
   */
  async runSQLQuery(query, requestId) {
    return new Promise((resolve, reject) => {
      this.db.all(query, (err, rows) => {
        if (err) {
          logger.error('Error ejecutando consulta SQL', {
            requestId,
            query: query.substring(0, 100),
            error: err.message
          });
          reject(createError('QUERY_EXECUTION_ERROR', 
            `Error ejecutando consulta SQL: ${err.message}`));
          return;
        }

        // Limitar resultados si es necesario
        const limitedRows = rows.slice(0, MAX_RESULT_ROWS);
        
        if (limitedRows.length < rows.length) {
          logger.warn('Resultados limitados por configuración', {
            requestId,
            originalRows: rows.length,
            limitedRows: limitedRows.length,
            maxResultRows: MAX_RESULT_ROWS
          });
        }

        resolve(limitedRows);
      });
    });
  }

  /**
   * Cerrar base de datos
   */
  async closeDatabase() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Limpiar archivos locales
   * @param {Array} localFiles - Lista de archivos locales
   */
  async cleanupLocalFiles(localFiles) {
    for (const file of localFiles) {
      try {
        await fs.unlink(file.localPath);
      } catch (error) {
        logger.warn('Error eliminando archivo local', {
          localPath: file.localPath,
          error: error.message
        });
      }
    }
  }

  /**
   * Limpiar directorio temporal
   */
  async cleanupTempDir() {
    try {
      await fs.rmdir(this.tempDir, { recursive: true });
      this.tempDir = null;
    } catch (error) {
      logger.warn('Error limpiando directorio temporal', {
        tempDir: this.tempDir,
        error: error.message
      });
    }
  }
}

// Instancia singleton
const sqlEngine = new SQLEngine();

module.exports = sqlEngine; 