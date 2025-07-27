/**
 * Utilidades para manejo de archivos
 * @module lambda-etl/utils/fileUtils
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { logger, logError } = require('../../../shared/utils/logger');
const { createError } = require('../../../shared/constants/errorCodes');

/**
 * Lee el contenido de un archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {string} - Contenido del archivo
 */
const readFile = async (filePath) => {
  try {
    logger.info('Leyendo archivo', { filePath });

    if (!await fs.pathExists(filePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo no encontrado: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf8');
    
    logger.info('Archivo leído exitosamente', {
      filePath,
      contentLength: content.length
    });

    return content;
  } catch (error) {
    logError(error, {
      filePath,
      operation: 'readFile'
    }, 'file-utils');

    throw error;
  }
};

/**
 * Escribe contenido a un archivo
 * @param {string} filePath - Ruta del archivo
 * @param {string} content - Contenido a escribir
 * @returns {Object} - Estadísticas del archivo
 */
const writeFile = async (filePath, content) => {
  try {
    logger.info('Escribiendo archivo', {
      filePath,
      contentLength: content.length
    });

    // Crear directorio si no existe
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);

    await fs.writeFile(filePath, content, 'utf8');
    const stats = await fs.stat(filePath);
    
    logger.info('Archivo escrito exitosamente', {
      filePath,
      fileSize: stats.size
    });

    return stats;
  } catch (error) {
    logError(error, {
      filePath,
      contentLength: content?.length,
      operation: 'writeFile'
    }, 'file-utils');

    throw createError('FILE_PROCESSING_FAILED', 
      `Error escribiendo archivo: ${error.message}`);
  }
};

/**
 * Limpia archivos temporales
 * @param {Array} filePaths - Rutas de archivos a eliminar
 * @returns {Array} - Lista de archivos eliminados
 */
const cleanupTempFiles = async (filePaths) => {
  const deletedFiles = [];
  
  for (const filePath of filePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        deletedFiles.push(filePath);
        
        logger.info('Archivo temporal eliminado', { filePath });
      }
    } catch (error) {
      logError(error, {
        filePath,
        operation: 'cleanupTempFiles'
      }, 'file-utils');
      
      // No lanzar error para no interrumpir la limpieza de otros archivos
    }
  }

  logger.info('Limpieza de archivos temporales completada', {
    totalFiles: filePaths.length,
    deletedFiles: deletedFiles.length
  });

  return deletedFiles;
};

/**
 * Crea un archivo temporal con un nombre único
 * @param {string} prefix - Prefijo para el nombre del archivo
 * @param {string} extension - Extensión del archivo
 * @returns {string} - Ruta del archivo temporal creado
 */
const createTempFile = async (prefix = 'temp', extension = '') => {
  try {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = `${prefix}_${timestamp}_${randomSuffix}${extension}`;
    const filePath = path.join(tempDir, fileName);

    // Crear archivo vacío
    await fs.writeFile(filePath, '');
    
    logger.info('Archivo temporal creado', { filePath });
    
    return filePath;
  } catch (error) {
    logError(error, {
      prefix,
      extension,
      operation: 'createTempFile'
    }, 'file-utils');

    throw createError('FILE_PROCESSING_FAILED', 
      `Error creando archivo temporal: ${error.message}`);
  }
};

/**
 * Obtiene el nombre del archivo desde una ruta
 * @param {string} filePath - Ruta del archivo
 * @returns {string} - Nombre del archivo
 */
const getFileNameFromPath = (filePath) => {
  return path.basename(filePath);
};

/**
 * Obtiene la extensión del archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {string} - Extensión del archivo
 */
const getFileExtension = (filePath) => {
  return path.extname(filePath).toLowerCase();
};

/**
 * Verifica si un archivo tiene una extensión específica
 * @param {string} filePath - Ruta del archivo
 * @param {string|Array} extensions - Extensión(es) a verificar
 * @returns {boolean} - True si el archivo tiene la extensión
 */
const hasExtension = (filePath, extensions) => {
  const fileExt = getFileExtension(filePath);
  
  if (Array.isArray(extensions)) {
    return extensions.includes(fileExt);
  }
  
  return fileExt === extensions;
};

/**
 * Obtiene estadísticas de un archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {Object} - Estadísticas del archivo
 */
const getFileStats = async (filePath) => {
  try {
    if (!await fs.pathExists(filePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo no encontrado: ${filePath}`);
    }

    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    logError(error, {
      filePath,
      operation: 'getFileStats'
    }, 'file-utils');

    throw error;
  }
};

/**
 * Copia un archivo a una nueva ubicación
 * @param {string} sourcePath - Ruta del archivo origen
 * @param {string} destinationPath - Ruta del archivo destino
 * @returns {Object} - Estadísticas del archivo copiado
 */
const copyFile = async (sourcePath, destinationPath) => {
  try {
    logger.info('Copiando archivo', {
      sourcePath,
      destinationPath
    });

    if (!await fs.pathExists(sourcePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo origen no encontrado: ${sourcePath}`);
    }

    // Crear directorio de destino si no existe
    const destDir = path.dirname(destinationPath);
    await fs.ensureDir(destDir);

    await fs.copy(sourcePath, destinationPath);
    const stats = await fs.stat(destinationPath);
    
    logger.info('Archivo copiado exitosamente', {
      sourcePath,
      destinationPath,
      fileSize: stats.size
    });

    return stats;
  } catch (error) {
    logError(error, {
      sourcePath,
      destinationPath,
      operation: 'copyFile'
    }, 'file-utils');

    throw createError('FILE_PROCESSING_FAILED', 
      `Error copiando archivo: ${error.message}`);
  }
};

/**
 * Mueve un archivo a una nueva ubicación
 * @param {string} sourcePath - Ruta del archivo origen
 * @param {string} destinationPath - Ruta del archivo destino
 * @returns {Object} - Estadísticas del archivo movido
 */
const moveFile = async (sourcePath, destinationPath) => {
  try {
    logger.info('Moviendo archivo', {
      sourcePath,
      destinationPath
    });

    if (!await fs.pathExists(sourcePath)) {
      throw createError('FILE_NOT_FOUND', `Archivo origen no encontrado: ${sourcePath}`);
    }

    // Crear directorio de destino si no existe
    const destDir = path.dirname(destinationPath);
    await fs.ensureDir(destDir);

    await fs.move(sourcePath, destinationPath);
    const stats = await fs.stat(destinationPath);
    
    logger.info('Archivo movido exitosamente', {
      sourcePath,
      destinationPath,
      fileSize: stats.size
    });

    return stats;
  } catch (error) {
    logError(error, {
      sourcePath,
      destinationPath,
      operation: 'moveFile'
    }, 'file-utils');

    throw createError('FILE_PROCESSING_FAILED', 
      `Error moviendo archivo: ${error.message}`);
  }
};

/**
 * Verifica si un archivo existe
 * @param {string} filePath - Ruta del archivo
 * @returns {boolean} - True si el archivo existe
 */
const fileExists = async (filePath) => {
  return await fs.pathExists(filePath);
};

/**
 * Obtiene el tamaño de un archivo en formato legible
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} - Tamaño formateado
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
  readFile,
  writeFile,
  cleanupTempFiles,
  createTempFile,
  getFileNameFromPath,
  getFileExtension,
  hasExtension,
  getFileStats,
  copyFile,
  moveFile,
  fileExists,
  formatFileSize
}; 