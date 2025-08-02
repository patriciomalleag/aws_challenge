import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { FaUpload, FaEye, FaEdit, FaSave, FaTrash, FaCloudUploadAlt, FaCogs, FaTable, FaCheckCircle, FaClock, FaFileAlt, FaDatabase, FaPlay } from 'react-icons/fa';
import axios from 'axios';

function Ingestor() {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [schema, setSchema] = useState([]);
  const [uploadConfig, setUploadConfig] = useState({
    separator: ',',
    directory: '',
    tableName: '',
    description: ''
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Cargar archivos existentes al montar el componente
  useEffect(() => {
    loadExistingFiles();
  }, []);

  const loadExistingFiles = async () => {
    try {
      console.log('[FRONTEND] Iniciando carga de archivos existentes...');
      console.log('[FRONTEND] Haciendo petición GET a /api/files');
      
      const response = await axios.get('/api/files');
      
      console.log('[FRONTEND] Respuesta recibida:', {
        status: response.status,
        statusText: response.statusText,
        dataLength: response.data ? response.data.length : 0,
        data: response.data
      });
      
      setFiles(response.data);
      console.log('[FRONTEND] Archivos cargados exitosamente:', response.data.length, 'archivos');
    } catch (error) {
      console.error('[FRONTEND] Error al cargar archivos existentes:', error);
      console.error('[FRONTEND] Detalles del error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        }
      });
      
      if (error.response) {
        console.error('[FRONTEND] Error de respuesta del servidor:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
        toast.error(`Error del servidor: ${error.response.data?.error || error.response.statusText}`);
      } else if (error.request) {
        console.error('[FRONTEND] Error de red - no se recibió respuesta:', error.request);
        toast.error('Error de conexión con el servidor');
      } else {
        console.error('[FRONTEND] Error al configurar la petición:', error.message);
        toast.error('Error al cargar archivos existentes');
      }
    }
  };

  const onDrop = async (acceptedFiles) => {
    console.log('[FRONTEND] onDrop iniciado:', acceptedFiles.length, 'archivos');
    
    if (acceptedFiles.length === 0) {
      console.log('[FRONTEND] No se seleccionaron archivos');
      return;
    }

    const file = acceptedFiles[0];
    console.log('[FRONTEND] Archivo seleccionado:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    });
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      console.error('[FRONTEND] Archivo no es CSV:', file.name);
      toast.error('Solo se permiten archivos CSV');
      return;
    }

    setCurrentFile(file);
    setIsAnalyzing(true);

    try {
      console.log('[FRONTEND] Leyendo contenido del archivo...');
      // Leer y analizar el archivo CSV
      const text = await file.text();
      console.log('[FRONTEND] Archivo leído, tamaño del texto:', text.length, 'caracteres');
      
      console.log('[FRONTEND] Iniciando parsing con Papa Parse...');
      const result = Papa.parse(text, {
        header: true,
        preview: 100, // Solo las primeras 100 filas para análisis
        skipEmptyLines: true
      });

      console.log('[FRONTEND] Resultado del parsing:', {
        dataRows: result.data.length,
        errors: result.errors.length,
        meta: result.meta
      });

      if (result.errors.length > 0) {
        console.error('[FRONTEND] Errores en el parsing:', result.errors);
        toast.error('Error al parsear el archivo CSV');
        return;
      }

      console.log('[FRONTEND] Generando esquema automático...');
      // Generar esquema automático
      const autoSchema = generateSchema(result.data);
      console.log('[FRONTEND] Esquema generado:', autoSchema);
      setSchema(autoSchema);

      // Sugerir nombre de tabla basado en el nombre del archivo
      const suggestedName = file.name.replace('.csv', '').replace(/[^a-zA-Z0-9]/g, '_');
      console.log('[FRONTEND] Nombre de tabla sugerido:', suggestedName);
      
      setUploadConfig(prev => ({
        ...prev,
        tableName: suggestedName,
        directory: 'datasets'
      }));

      console.log('[FRONTEND] Análisis de archivo completado exitosamente');
      toast.success('Archivo analizado correctamente');
    } catch (error) {
      console.error('[FRONTEND] Error al analizar archivo:', error);
      console.error('[FRONTEND] Detalles del error:', {
        message: error.message,
        stack: error.stack,
        fileName: file?.name,
        fileSize: file?.size
      });
      toast.error('Error al analizar el archivo');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const cleanColumnName = (columnName) => {
    if (!columnName) return '';
    
    let cleaned = columnName
      // Convertir a minúsculas
      .toLowerCase()
      // Eliminar caracteres especiales y espacios
      .replace(/[^a-z0-9]/g, '_')
      // Eliminar múltiples guiones bajos consecutivos
      .replace(/_+/g, '_')
      // Eliminar guiones bajos al inicio y final
      .replace(/^_+|_+$/g, '')
      // Asegurar que no esté vacío
      || 'column';
    
    // Si comienza con un número, agregar 'c_' al principio
    if (/^[0-9]/.test(cleaned)) {
      cleaned = 'c_' + cleaned;
    }
    
    return cleaned;
  };

  const generateSchema = (data) => {
    if (data.length === 0) return [];

    const sampleRow = data[0];
    const schema = [];
    const usedNames = new Set();

    for (const [key, value] of Object.entries(sampleRow)) {
      const type = inferDataType(value, data.map(row => row[key]));
      let cleanName = cleanColumnName(key);
      
      // Evitar nombres duplicados
      let finalName = cleanName;
      let counter = 1;
      while (usedNames.has(finalName)) {
        finalName = `${cleanName}_${counter}`;
        counter++;
      }
      usedNames.add(finalName);
      
      schema.push({
        name: finalName,
        originalName: key, // Mantener el nombre original para referencia
        type: type,
        nullable: true,
        description: `Campo derivado de "${key}"`
      });
    }

    return schema;
  };

  const inferDataType = (value, allValues) => {
    if (!value) return 'string';

    // Intentar detectar el tipo basado en el valor
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

  const updateSchemaField = (index, field, value) => {
    const newSchema = [...schema];
    newSchema[index] = { ...newSchema[index], [field]: value };
    setSchema(newSchema);
  };

  const removeSchemaField = (index) => {
    const newSchema = schema.filter((_, i) => i !== index);
    setSchema(newSchema);
  };

  const addSchemaField = () => {
    setSchema([...schema, {
      name: '',
      type: 'string',
      nullable: true,
      description: ''
    }]);
  };

  const handleUpload = async () => {
    console.log('[FRONTEND] Iniciando proceso de upload...');
    
    if (!currentFile) {
      console.error('[FRONTEND] No hay archivo seleccionado');
      toast.error('No hay archivo seleccionado');
      return;
    }

    if (!uploadConfig.tableName || !uploadConfig.directory) {
      console.error('[FRONTEND] Configuración incompleta:', uploadConfig);
      toast.error('Completa el nombre de la tabla y directorio');
      return;
    }

    if (schema.length === 0) {
      console.error('[FRONTEND] Esquema vacío');
      toast.error('Define al menos un campo en el esquema');
      return;
    }

    console.log('[FRONTEND] Validaciones pasadas, preparando upload:', {
      fileName: currentFile.name,
      fileSize: currentFile.size,
      config: uploadConfig,
      schemaFields: schema.length
    });

    setIsUploading(true);

    try {
      // Crear FormData con el archivo y metadatos
      console.log('[FRONTEND] Creando FormData...');
      const formData = new FormData();
      formData.append('file', currentFile);
      formData.append('config', JSON.stringify(uploadConfig));
      formData.append('schema', JSON.stringify(schema));
      
      console.log('[FRONTEND] FormData creado:', {
        hasFile: formData.has('file'),
        hasConfig: formData.has('config'),
        hasSchema: formData.has('schema')
      });

      console.log('[FRONTEND] Enviando petición POST a /api/upload...');
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log('[FRONTEND] Respuesta del upload recibida:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });

      toast.success('Archivo subido correctamente');
      
      // Limpiar formulario
      console.log('[FRONTEND] Limpiando formulario...');
      setCurrentFile(null);
      setSchema([]);
      setUploadConfig({
        separator: ',',
        directory: '',
        tableName: '',
        description: ''
      });

      // Recargar archivos
      console.log('[FRONTEND] Recargando lista de archivos...');
      loadExistingFiles();
    } catch (error) {
      console.error('[FRONTEND] Error en upload:', error);
      console.error('[FRONTEND] Detalles del error de upload:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      
      if (error.response) {
        console.error('[FRONTEND] Error de respuesta del servidor en upload:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
        
        // Mostrar mensaje de error más específico
        const errorMessage = error.response.data?.error || error.response.statusText;
        console.error('[FRONTEND] Mensaje de error específico:', errorMessage);
        toast.error(`Error del servidor: ${errorMessage}`);
      } else if (error.request) {
        console.error('[FRONTEND] Error de red en upload - no se recibió respuesta:', error.request);
        toast.error('Error de conexión con el servidor');
      } else {
        console.error('[FRONTEND] Error al configurar la petición de upload:', error.message);
        toast.error('Error al subir el archivo');
      }
    } finally {
      console.log('[FRONTEND] Finalizando proceso de upload');
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: false
  });

  return (
    <div className="ingestor-container animate-fadeIn">
      {/* Header del Ingestor */}
      <div className="ingestor-header">
        <div className="header-content">
          <h1 className="ingestor-title">
            <FaCloudUploadAlt className="title-icon" />
            Carga de Datos
          </h1>
          <p className="ingestor-subtitle">
            Sube, configura y procesa tus archivos CSV de manera inteligente
          </p>
        </div>
        
        <div className="process-steps">
          <div className={`step ${currentFile ? 'active' : ''}`}>
            <div className="step-icon">
              <FaUpload />
            </div>
            <span>Subir</span>
          </div>
          <div className="step-arrow"></div>
          <div className={`step ${schema.length > 0 ? 'active' : ''}`}>
            <div className="step-icon">
              <FaCogs />
            </div>
            <span>Configurar</span>
          </div>
          <div className="step-arrow"></div>
          <div className="step">
            <div className="step-icon">
              <FaPlay />
            </div>
            <span>Procesar</span>
          </div>
        </div>
      </div>

      {/* Archivos existentes - Versión moderna */}
      <div className="files-section">
        <div className="section-header">
          <h3 className="section-title">
            <FaDatabase className="section-icon" />
            Archivos en tu Pipeline
          </h3>
          <div className="files-stats">
            <span className="stat-item">
              <strong>{files.length}</strong> archivos totales
            </span>
          </div>
        </div>
        
        {files.length === 0 ? (
          <div className="empty-state">
            <FaFileAlt className="empty-icon" />
            <h4>No hay archivos cargados</h4>
            <p>Sube tu primer archivo CSV para comenzar</p>
          </div>
        ) : (
          <div className="files-grid">
            {files.map((file, index) => (
              <div key={index} className="file-card animate-slideIn" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="file-header">
                  <div className="file-icon">
                    <FaTable />
                  </div>

                </div>
                
                <div className="file-content">
                  <h4 className="file-name">{file.name}</h4>
                  <div className="file-details">
                    <div className="detail-item">
                      <span className="detail-label">Tabla:</span>
                      <span className="detail-value">{file.tableName}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Directorio:</span>
                      <span className="detail-value">{file.directory}</span>
                    </div>
                  </div>
                </div>
                
                <div className="file-actions">
                  <button className="action-btn primary" title="Ver detalles">
                    <FaEye />
                  </button>
                  <button className="action-btn danger" title="Eliminar">
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona de subida - Modernizada */}
      <div className="upload-section">
        <div className="section-header">
          <h3 className="section-title">
            <FaCloudUploadAlt className="section-icon" />
            Subir Nuevo Archivo
          </h3>
        </div>
        
        <div {...getRootProps()} className={`dropzone-modern ${isDragActive ? 'active' : ''} ${currentFile ? 'has-file' : ''}`}>
          <input {...getInputProps()} />
          
          {isAnalyzing ? (
            <div className="upload-state analyzing">
              <div className="upload-spinner"></div>
              <div className="upload-content">
                <h4>Analizando archivo...</h4>
                <p>Detectando estructura y tipos de datos</p>
              </div>
            </div>
          ) : currentFile ? (
            <div className="upload-state success">
              <div className="upload-icon success">
                <FaCheckCircle />
              </div>
              <div className="upload-content">
                <h4>Archivo cargado</h4>
                <p className="file-name">{currentFile.name}</p>
                <small>Arrastra otro archivo para reemplazar</small>
              </div>
            </div>
          ) : (
            <div className="upload-state empty">
              <div className="upload-icon">
                <FaCloudUploadAlt />
              </div>
              <div className="upload-content">
                <h4>Arrastra tu archivo CSV aquí</h4>
                <p>o haz clic para seleccionar desde tu dispositivo</p>
                <div className="upload-features">
                  <span className="feature">✨ Detección automática de esquema</span>
                  <span className="feature">🔍 Validación en tiempo real</span>
                  <span className="feature">⚡ Procesamiento optimizado</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Configuración del archivo */}
        {currentFile && (
          <div className="config-section animate-slideIn">
            <h4 className="config-title">
              <FaCogs className="me-2" />
              Configuración del archivo
            </h4>
            
            <div className="config-grid">
              <div className="config-field">
                <label className="config-label">
                  <FaEdit className="label-icon" />
                  Separador CSV
                </label>
                <select 
                  className="config-input"
                  value={uploadConfig.separator}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, separator: e.target.value }))}
                >
                  <option value=",">Coma (,)</option>
                  <option value=";">Punto y coma (;)</option>
                  <option value="\t">Tab (\t)</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
              
              <div className="config-field">
                <label className="config-label">
                  <FaDatabase className="label-icon" />
                  Directorio de destino
                </label>
                <input
                  type="text"
                  className="config-input"
                  placeholder="ej: datasets, analytics, raw_data"
                  value={uploadConfig.directory}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, directory: e.target.value }))}
                />
              </div>
              
              <div className="config-field">
                <label className="config-label">
                  <FaTable className="label-icon" />
                  Nombre de la tabla
                </label>
                <input
                  type="text"
                  className="config-input"
                  placeholder="ej: usuarios, ventas, productos"
                  value={uploadConfig.tableName}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, tableName: e.target.value }))}
                />
              </div>
              
              <div className="config-field">
                <label className="config-label">
                  <FaFileAlt className="label-icon" />
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  className="config-input"
                  placeholder="Describe el contenido de este dataset"
                  value={uploadConfig.description}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Esquema de datos - Modernizado */}
      {schema.length > 0 && (
        <div className="schema-section animate-slideIn">
          <div className="section-header">
            <h3 className="section-title">
              <FaTable className="section-icon" />
              Esquema de Datos
            </h3>
            <button className="add-field-btn" onClick={addSchemaField}>
              <FaEdit className="btn-icon" />
              Agregar Campo
            </button>
          </div>
          
          <div className="schema-container">
            <div className="schema-header">
              <div className="header-col">Campo</div>
              <div className="header-col">Tipo</div>
              <div className="header-col">Descripción</div>
              <div className="header-col">Nullable</div>
              <div className="header-col">Acción</div>
            </div>
            
            <div className="schema-fields">
              {schema.map((field, index) => (
                <div key={index} className="schema-field-modern">
                  <div className="field-col">
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Nombre del campo"
                      value={field.name}
                      onChange={(e) => updateSchemaField(index, 'name', e.target.value)}
                      title={field.originalName ? `Original: "${field.originalName}"` : ''}
                    />
                    {field.originalName && field.originalName !== field.name && (
                      <small className="original-name-hint">
                        Original: "{field.originalName}"
                      </small>
                    )}
                  </div>
                  
                  <div className="field-col">
                    <select
                      className="field-select"
                      value={field.type}
                      onChange={(e) => updateSchemaField(index, 'type', e.target.value)}
                    >
                      <option value="string">String</option>
                      <option value="integer">Integer</option>
                      <option value="float">Float</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                  
                  <div className="field-col">
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Descripción del campo"
                      value={field.description}
                      onChange={(e) => updateSchemaField(index, 'description', e.target.value)}
                    />
                  </div>
                  
                  <div className="field-col">
                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={field.nullable}
                        onChange={(e) => updateSchemaField(index, 'nullable', e.target.checked)}
                      />
                      <span className="checkmark"></span>
                    </label>
                  </div>
                  
                  <div className="field-col">
                    <button
                      className="remove-field-btn"
                      onClick={() => removeSchemaField(index)}
                      title="Eliminar campo"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Botón de procesamiento - Modernizado */}
      {currentFile && schema.length > 0 && (
        <div className="process-section">
          <div className="process-info">
            <div className="info-card">
              <FaFileAlt className="info-icon" />
              <div className="info-content">
                <h5>Archivo preparado</h5>
                <p>{currentFile.name}</p>
              </div>
            </div>
            
            <div className="info-card">
              <FaTable className="info-icon" />
              <div className="info-content">
                <h5>Campos definidos</h5>
                <p>{schema.length} columnas</p>
              </div>
            </div>
            
            <div className="info-card">
              <FaDatabase className="info-icon" />
              <div className="info-content">
                <h5>Tabla destino</h5>
                <p>{uploadConfig.tableName || 'Sin definir'}</p>
              </div>
            </div>
          </div>
          
          <button
            className={`process-button ${isUploading ? 'processing' : ''}`}
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="processing-content">
                <div className="processing-spinner"></div>
                <span className="processing-text">
                  <strong>Procesando...</strong>
                  <small>Analizando y almacenando datos</small>
                </span>
              </div>
            ) : (
              <div className="process-content">
                <FaPlay className="process-icon" />
                <span className="process-text">
                  <strong>Iniciar Procesamiento</strong>
                  <small>Ingesta y procesa el archivo</small>
                </span>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default Ingestor; 