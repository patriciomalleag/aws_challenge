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
 * Clase para manejar consultas SQL sobre archivos Parquet
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
   * Leer archivos Parquet y convertirlos a Arrow
   * @param {Array} localFiles - Lista de archivos locales
   * @param {string} requestId - ID de la request
   * @returns {Array} - Lista de tablas Arrow
   */
  async readParquetFiles(localFiles, requestId) {
    const arrowTables = [];
    
    for (const file of localFiles) {
      try {
        const buffer = await fs.readFile(file.localPath);
        
        // Usar la API correcta de Apache Arrow para Node.js
        const table = await arrow.tableFromIPC(buffer);
        
        arrowTables.push({
          table,
          localPath: file.localPath,
          s3Key: file.s3Key
        });

        logger.debug('Archivo Parquet leído como Arrow', {
          requestId,
          s3Key: file.s3Key,
          rows: table.numRows,
          columns: table.numCols
        });

      } catch (error) {
        logger.error('Error leyendo archivo Parquet', {
          requestId,
          localPath: file.localPath,
          error: error.message
        });
        throw error;
      }
    }

    return arrowTables;
  }

  /**
   * Crear tabla virtual en SQLite
   * @param {Array} arrowTables - Lista de tablas Arrow
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   */
  async createVirtualTable(arrowTables, tableName, requestId) {
    return new Promise((resolve, reject) => {
      try {
        // Combinar todas las tablas Arrow en una sola
        const combinedTable = this.combineArrowTables(arrowTables);
        
        // Crear tabla temporal en SQLite
        const createTableSQL = this.generateCreateTableSQL(combinedTable, tableName);
        
        this.db.run(createTableSQL, (err) => {
          if (err) {
            logger.error('Error creando tabla SQLite', {
              requestId,
              error: err.message
            });
            reject(err);
            return;
          }

          // Insertar datos
          this.insertArrowData(combinedTable, tableName, requestId)
            .then(resolve)
            .catch(reject);

        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Combinar múltiples tablas Arrow
   * @param {Array} arrowTables - Lista de tablas Arrow
   * @returns {Object} - Tabla combinada
   */
  combineArrowTables(arrowTables) {
    if (arrowTables.length === 1) {
      return arrowTables[0].table;
    }

    // Combinar múltiples tablas
    const tables = arrowTables.map(item => item.table);
    try {
      return arrow.tableFromArrays(tables);
    } catch (error) {
      logger.error('Error combinando tablas Arrow', { error: error.message });
      throw createError('PARQUET_CONVERSION_ERROR', 'Error combinando archivos Parquet');
    }
  }

  /**
   * Generar SQL para crear tabla
   * @param {Object} arrowTable - Tabla Arrow
   * @param {string} tableName - Nombre de la tabla
   * @returns {string} - SQL para crear tabla
   */
  generateCreateTableSQL(arrowTable, tableName) {
    const columns = [];
    
    for (let i = 0; i < arrowTable.numCols; i++) {
      const column = arrowTable.getColumn(i);
      const columnName = column.name;
      const arrowType = column.type;
      
      // Mapear tipos Arrow a SQLite
      let sqliteType = 'TEXT';
      try {
        if (arrowType.isInt()) {
          sqliteType = 'INTEGER';
        } else if (arrowType.isFloat()) {
          sqliteType = 'REAL';
        } else if (arrowType.isBool()) {
          sqliteType = 'INTEGER';
        } else if (arrowType.isDate()) {
          sqliteType = 'TEXT';
        }
      } catch (error) {
        logger.warn('Error mapeando tipo Arrow, usando TEXT por defecto', {
          columnName,
          arrowType: arrowType.toString(),
          error: error.message
        });
        sqliteType = 'TEXT';
      }
      
      columns.push(`"${columnName}" ${sqliteType}`);
    }

    return `CREATE TABLE "${tableName}" (${columns.join(', ')})`;
  }

  /**
   * Insertar datos Arrow en SQLite
   * @param {Object} arrowTable - Tabla Arrow
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   */
  async insertArrowData(arrowTable, tableName, requestId) {
    return new Promise((resolve, reject) => {
      const numRows = arrowTable.numRows;
      const numCols = arrowTable.numCols;
      
      // Preparar statement de inserción
      const placeholders = Array(numCols).fill('?').join(', ');
      const insertSQL = `INSERT INTO "${tableName}" VALUES (${placeholders})`;
      
      const stmt = this.db.prepare(insertSQL, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Insertar filas en lotes
        const batchSize = Math.min(1000, Math.floor(50000000 / numCols)); // Limitar por memoria
        let insertedRows = 0;

        const insertBatch = (startRow) => {
          const endRow = Math.min(startRow + batchSize, numRows);
          
          for (let row = startRow; row < endRow; row++) {
            const values = [];
            for (let col = 0; col < numCols; col++) {
              const column = arrowTable.getColumn(col);
              const value = column.get(row);
              values.push(value);
            }
            
            stmt.run(values, (err) => {
              if (err) {
                stmt.finalize();
                reject(err);
                return;
              }
            });
          }

          insertedRows += (endRow - startRow);
          
          if (endRow < numRows) {
            // Continuar con el siguiente lote
            setImmediate(() => insertBatch(endRow));
          } else {
            // Finalizar inserción
            stmt.finalize((err) => {
              if (err) {
                reject(err);
              } else {
                logger.info('Datos insertados en SQLite', {
                  requestId,
                  tableName,
                  insertedRows
                });
                resolve();
              }
            });
          }
        };

        insertBatch(0);
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