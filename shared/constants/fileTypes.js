/**
 * Constantes para tipos de archivo permitidos en el sistema
 * @module constants/fileTypes
 */

// Tipos MIME permitidos para carga de archivos
const ALLOWED_MIME_TYPES = {
  CSV: 'text/csv',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  EXCEL_LEGACY: 'application/vnd.ms-excel'
};

// Extensiones de archivo permitidas
const ALLOWED_EXTENSIONS = {
  CSV: '.csv',
  EXCEL: '.xlsx',
  EXCEL_LEGACY: '.xls'
};

// Tamaños máximos de archivo (en bytes)
const MAX_FILE_SIZES = {
  CSV: 100 * 1024 * 1024, // 100MB
  EXCEL: 50 * 1024 * 1024, // 50MB
  DEFAULT: 100 * 1024 * 1024 // 100MB por defecto
};

// Configuración de chunking para archivos grandes
const CHUNK_CONFIG = {
  MAX_ROWS_PER_CHUNK: 10000,
  MAX_MEMORY_USAGE_MB: 512
};

// Headers HTTP para descarga de archivos
const DOWNLOAD_HEADERS = {
  CSV: {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="data.csv"'
  },
  JSON: {
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="data.json"'
  }
};

/**
 * Valida si un tipo MIME está permitido
 * @param {string} mimeType - Tipo MIME a validar
 * @returns {boolean} - True si está permitido
 */
const isAllowedMimeType = (mimeType) => {
  return Object.values(ALLOWED_MIME_TYPES).includes(mimeType);
};

/**
 * Obtiene la extensión de archivo basada en el tipo MIME
 * @param {string} mimeType - Tipo MIME
 * @returns {string|null} - Extensión correspondiente o null
 */
const getExtensionFromMimeType = (mimeType) => {
  const mimeToExt = {
    [ALLOWED_MIME_TYPES.CSV]: ALLOWED_EXTENSIONS.CSV,
    [ALLOWED_MIME_TYPES.EXCEL]: ALLOWED_EXTENSIONS.EXCEL,
    [ALLOWED_MIME_TYPES.EXCEL_LEGACY]: ALLOWED_EXTENSIONS.EXCEL_LEGACY
  };
  return mimeToExt[mimeType] || null;
};

/**
 * Obtiene el tamaño máximo permitido para un tipo de archivo
 * @param {string} mimeType - Tipo MIME
 * @returns {number} - Tamaño máximo en bytes
 */
const getMaxFileSize = (mimeType) => {
  if (mimeType === ALLOWED_MIME_TYPES.CSV) {
    return MAX_FILE_SIZES.CSV;
  }
  if (mimeType === ALLOWED_MIME_TYPES.EXCEL || mimeType === ALLOWED_MIME_TYPES.EXCEL_LEGACY) {
    return MAX_FILE_SIZES.EXCEL;
  }
  return MAX_FILE_SIZES.DEFAULT;
};

/**
 * Valida si un archivo cumple con las restricciones de tamaño
 * @param {number} fileSize - Tamaño del archivo en bytes
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {boolean} - True si el tamaño es válido
 */
const isValidFileSize = (fileSize, mimeType) => {
  const maxSize = getMaxFileSize(mimeType);
  return fileSize <= maxSize;
};

module.exports = {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZES,
  CHUNK_CONFIG,
  DOWNLOAD_HEADERS,
  isAllowedMimeType,
  getExtensionFromMimeType,
  getMaxFileSize,
  isValidFileSize
}; 