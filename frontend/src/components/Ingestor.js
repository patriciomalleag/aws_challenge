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
      const response = await axios.get('/api/files');
      setFiles(response.data);
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Error al cargar archivos existentes');
    }
  };

  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Solo se permiten archivos CSV');
      return;
    }

    setCurrentFile(file);
    setIsAnalyzing(true);

    try {
      // Leer y analizar el archivo CSV
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        preview: 100, // Solo las primeras 100 filas para análisis
        skipEmptyLines: true
      });

      if (result.errors.length > 0) {
        toast.error('Error al parsear el archivo CSV');
        return;
      }

      // Generar esquema automático
      const autoSchema = generateSchema(result.data);
      setSchema(autoSchema);

      // Sugerir nombre de tabla basado en el nombre del archivo
      const suggestedName = file.name.replace('.csv', '').replace(/[^a-zA-Z0-9]/g, '_');
      setUploadConfig(prev => ({
        ...prev,
        tableName: suggestedName,
        directory: 'datasets'
      }));

      toast.success('Archivo analizado correctamente');
    } catch (error) {
      console.error('Error analyzing file:', error);
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
    if (!currentFile) {
      toast.error('No hay archivo seleccionado');
      return;
    }

    if (!uploadConfig.tableName || !uploadConfig.directory) {
      toast.error('Completa el nombre de la tabla y directorio');
      return;
    }

    if (schema.length === 0) {
      toast.error('Define al menos un campo en el esquema');
      return;
    }

    setIsUploading(true);

    try {
      // Crear FormData con el archivo y metadatos
      const formData = new FormData();
      formData.append('file', currentFile);
      formData.append('config', JSON.stringify(uploadConfig));
      formData.append('schema', JSON.stringify(schema));

      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success('Archivo subido correctamente');
      
      // Limpiar formulario
      setCurrentFile(null);
      setSchema([]);
      setUploadConfig({
        separator: ',',
        directory: '',
        tableName: '',
        description: ''
      });

      // Recargar archivos
      loadExistingFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo');
    } finally {
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