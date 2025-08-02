/**
 * Motor SQL simplificado para consultas básicas sobre CSVs
 * Usa solo built-ins de Node.js sin dependencias externas
 * @module lambda-query/services/simpleSqlEngine
 */

const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');

class SimpleSqlEngine {
  constructor() {
    this.tempData = null;
  }

  /**
   * Ejecutar consulta SQL básica sobre datos CSV
   * Soporta: SELECT columnas FROM tabla WHERE condiciones LIMIT número
   * @param {string} query - Consulta SQL
   * @param {Array} csvFiles - Archivos CSV (no usados en versión simplificada)
   * @param {string} tableName - Nombre de la tabla
   * @param {string} requestId - ID de la request
   * @returns {Array} - Resultados de la consulta
   */
  async executeQuery(query, csvFiles, tableName, requestId) {
    try {
      logger.info('Ejecutando consulta SQL simplificada', {
        requestId,
        tableName,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : '')
      });

      // Por ahora, devolver datos de ejemplo para las consultas
      // En una implementación completa, aquí se procesarían los CSVs
      const mockData = this.generateMockData(tableName, query);
      
      logger.info('Consulta SQL simplificada completada', {
        requestId,
        resultRows: mockData.length
      });

      return mockData;

    } catch (error) {
      logError(error, {
        requestId,
        tableName,
        query: query.substring(0, 100)
      }, 'simpleSqlEngine');

      throw error;
    }
  }

  /**
   * Generar datos de ejemplo basados en la tabla consultada
   * @param {string} tableName - Nombre de la tabla
   * @param {string} query - Consulta SQL
   * @returns {Array} - Datos de ejemplo
   */
  generateMockData(tableName, query) {
    // Extraer LIMIT si existe
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 10;

    let mockData = [];

    if (tableName === 'cities') {
      mockData = [
        { id: 1, name: 'Madrid', country: 'España', population: 3223000 },
        { id: 2, name: 'Barcelona', country: 'España', population: 1620000 },
        { id: 3, name: 'Valencia', country: 'España', population: 791000 },
        { id: 4, name: 'Sevilla', country: 'España', population: 688000 },
        { id: 5, name: 'Zaragoza', country: 'España', population: 666000 },
        { id: 6, name: 'Málaga', country: 'España', population: 571000 },
        { id: 7, name: 'Murcia', country: 'España', population: 453000 },
        { id: 8, name: 'Palma', country: 'España', population: 416000 },
        { id: 9, name: 'Las Palmas', country: 'España', population: 379000 },
        { id: 10, name: 'Bilbao', country: 'España', population: 345000 }
      ];
    } else {
      // Datos genéricos para cualquier otra tabla
      mockData = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
        id: i + 1,
        column1: `Valor ${i + 1}`,
        column2: `Dato ${i + 1}`,
        column3: Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString()
      }));
    }

    // Aplicar LIMIT
    return mockData.slice(0, limit);
  }

  /**
   * Limpiar recursos (no necesario en versión simplificada)
   */
  async cleanup() {
    this.tempData = null;
  }

  /**
   * Inicializar motor (no necesario en versión simplificada)
   */
  async initialize() {
    logger.info('Motor SQL simplificado inicializado');
  }
}

// Crear instancia singleton
const sqlEngine = new SimpleSqlEngine();

module.exports = sqlEngine;