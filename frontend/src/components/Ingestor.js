import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { FaUpload, FaEye, FaEdit, FaSave, FaTrash } from 'react-icons/fa';
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

  const generateSchema = (data) => {
    if (data.length === 0) return [];

    const sampleRow = data[0];
    const schema = [];

    for (const [key, value] of Object.entries(sampleRow)) {
      const type = inferDataType(value, data.map(row => row[key]));
      schema.push({
        name: key,
        type: type,
        nullable: true,
        description: ''
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
    <div>
      <h2 className="mb-4">
        <FaUpload className="me-2" />
        Ingestor de Datos
      </h2>

      {/* Archivos existentes */}
      <div className="card mb-4">
        <h4>Archivos Cargados</h4>
        {files.length === 0 ? (
          <p className="text-muted">No hay archivos cargados</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Directorio</th>
                  <th>Tabla</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => (
                  <tr key={index}>
                    <td>{file.name}</td>
                    <td>{file.directory}</td>
                    <td>{file.tableName}</td>
                    <td>
                      <span className={`badge ${file.status === 'processed' ? 'bg-success' : 'bg-warning'}`}>
                        {file.status === 'processed' ? 'Procesado' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline-primary me-1">
                        <FaEye />
                      </button>
                      <button className="btn btn-sm btn-outline-danger">
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subida de archivo */}
      <div className="card mb-4">
        <h4>Subir Nuevo Archivo</h4>
        
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {isAnalyzing ? (
            <div className="loading">
              <div className="spinner"></div>
              <span className="ms-2">Analizando archivo...</span>
            </div>
          ) : currentFile ? (
            <div>
              <FaUpload className="mb-2" style={{ fontSize: '2rem' }} />
              <p className="mb-0">Archivo seleccionado: <strong>{currentFile.name}</strong></p>
              <small className="text-muted">Arrastra otro archivo para cambiar</small>
            </div>
          ) : (
            <div>
              <FaUpload className="mb-2" style={{ fontSize: '2rem' }} />
              <p className="mb-0">Arrastra un archivo CSV aquí o haz clic para seleccionar</p>
              <small className="text-muted">Solo archivos CSV</small>
            </div>
          )}
        </div>

        {currentFile && (
          <div className="mt-3">
            <div className="row">
              <div className="col-md-6">
                <label className="form-label">Separador</label>
                <select 
                  className="form-select"
                  value={uploadConfig.separator}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, separator: e.target.value }))}
                >
                  <option value=",">Coma (,)</option>
                  <option value=";">Punto y coma (;)</option>
                  <option value="\t">Tab</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Directorio</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="ej: datasets, raw_data, etc."
                  value={uploadConfig.directory}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, directory: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="row mt-3">
              <div className="col-md-6">
                <label className="form-label">Nombre de la Tabla</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="ej: usuarios, ventas, etc."
                  value={uploadConfig.tableName}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, tableName: e.target.value }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Descripción</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Descripción opcional"
                  value={uploadConfig.description}
                  onChange={(e) => setUploadConfig(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Esquema */}
      {schema.length > 0 && (
        <div className="card mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>Esquema de Datos</h4>
            <button className="btn btn-sm btn-outline-primary" onClick={addSchemaField}>
              <FaEdit className="me-1" />
              Agregar Campo
            </button>
          </div>
          
          <div className="schema-preview">
            {schema.map((field, index) => (
              <div key={index} className="schema-field">
                <div className="row w-100">
                  <div className="col-md-3">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Nombre del campo"
                      value={field.name}
                      onChange={(e) => updateSchemaField(index, 'name', e.target.value)}
                    />
                  </div>
                  <div className="col-md-2">
                    <select
                      className="form-select form-select-sm"
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
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Descripción"
                      value={field.description}
                      onChange={(e) => updateSchemaField(index, 'description', e.target.value)}
                    />
                  </div>
                  <div className="col-md-2">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={field.nullable}
                        onChange={(e) => updateSchemaField(index, 'nullable', e.target.checked)}
                      />
                      <label className="form-check-label">Nullable</label>
                    </div>
                  </div>
                  <div className="col-md-1">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeSchemaField(index)}
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón de ingesta */}
      {currentFile && schema.length > 0 && (
        <div className="text-center">
          <button
            className="btn btn-success btn-lg"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                Ingestionando...
              </>
            ) : (
              <>
                <FaSave className="me-2" />
                Ingestar Datos
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default Ingestor; 