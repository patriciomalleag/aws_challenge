import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FaDatabase, FaPlay, FaEye, FaTable, FaColumns, FaInfoCircle } from 'react-icons/fa';
import axios from 'axios';

function Queries() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(true);

  // Cargar tablas al montar el componente
  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      console.log('[FRONTEND-QUERIES] Iniciando carga de tablas...');
      setIsLoadingTables(true);
      
      console.log('[FRONTEND-QUERIES] Haciendo petición GET a /api/files');
      const response = await axios.get('/api/files');
      
      console.log('[FRONTEND-QUERIES] Respuesta recibida:', {
        status: response.status,
        dataLength: response.data ? response.data.length : 0,
        data: response.data
      });
      
      // Agrupar archivos por tabla
      console.log('[FRONTEND-QUERIES] Agrupando archivos por tabla...');
      const tableGroups = {};
      response.data.forEach(file => {
        if (!tableGroups[file.tableName]) {
          tableGroups[file.tableName] = {
            name: file.tableName,
            description: file.description || '',
            files: [],
            lastUpdated: file.createdAt,
            recordCount: file.recordCount || 0
          };
        }
        tableGroups[file.tableName].files.push(file);
      });

      const tablesList = Object.values(tableGroups).map(table => ({
        ...table,
        lastUpdated: new Date(table.lastUpdated).toLocaleDateString('es-ES')
      }));

      console.log('[FRONTEND-QUERIES] Tablas procesadas:', tablesList.length, 'tablas encontradas');
      setTables(tablesList);
    } catch (error) {
      console.error('[FRONTEND-QUERIES] Error al cargar tablas:', error);
      console.error('[FRONTEND-QUERIES] Detalles del error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config
      });
      
      const errorMessage = error.response?.data?.error || 'Error al cargar las tablas';
      toast.error(errorMessage);
      
      // Mostrar más detalles en consola para debugging
      if (error.response?.status === 500) {
        console.error('[FRONTEND-QUERIES] Error 500 - posible problema en el backend. Revisar logs del servidor.');
      }
    } finally {
      setIsLoadingTables(false);
    }
  };

  const handleTableSelect = async (table) => {
    console.log('[FRONTEND-QUERIES] Seleccionando tabla:', table.name);
    setSelectedTable(table);
    
    // Generar query de ejemplo
    const exampleQuery = `SELECT * FROM "${table.name}" LIMIT 10`;
    setQuery(exampleQuery);
    console.log('[FRONTEND-QUERIES] Query de ejemplo generada:', exampleQuery);
    
    // Cargar esquema de la tabla
    try {
      console.log('[FRONTEND-QUERIES] Cargando esquema para tabla:', table.name);
      const response = await axios.get(`/api/schema/${table.name}`);
      
      console.log('[FRONTEND-QUERIES] Esquema recibido:', {
        status: response.status,
        hasSchema: !!response.data.schema,
        columns: response.data.schema ? response.data.schema.length : 0
      });
      
      setSelectedTable({
        ...table,
        schema: response.data.schema
      });
    } catch (error) {
      console.error('[FRONTEND-QUERIES] Error cargando esquema:', error);
      console.error('[FRONTEND-QUERIES] Detalles del error del esquema:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        tableName: table.name
      });
      toast.warning('No se pudo cargar el esquema de la tabla');
    }
  };

  const executeQuery = async () => {
    console.log('[FRONTEND-QUERIES] Iniciando ejecución de consulta...');
    
    if (!query.trim()) {
      console.error('[FRONTEND-QUERIES] Consulta vacía');
      toast.error('Por favor ingresa una consulta SQL');
      return;
    }

    if (!selectedTable?.name) {
      console.error('[FRONTEND-QUERIES] No hay tabla seleccionada');
      toast.error('Por favor selecciona una tabla primero');
      return;
    }

    console.log('[FRONTEND-QUERIES] Validaciones pasadas, ejecutando consulta:', {
      query: query.trim(),
      tableName: selectedTable.name
    });

    setIsLoading(true);
    try {
      console.log('[FRONTEND-QUERIES] Enviando petición POST a /api/query...');
      const response = await axios.post('/api/query', {
        query: query.trim(),
        tableName: selectedTable.name
      });

      console.log('[FRONTEND-QUERIES] Respuesta de consulta recibida:', {
        status: response.status,
        dataKeys: response.data ? Object.keys(response.data) : [],
        hasResults: !!response.data.results,
        resultsLength: response.data.results ? response.data.results.length : 0
      });

      setResults(response.data);
      toast.success('Consulta ejecutada correctamente');
    } catch (error) {
      console.error('[FRONTEND-QUERIES] Error ejecutando consulta:', error);
      console.error('[FRONTEND-QUERIES] Detalles del error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        query: query.trim(),
        tableName: selectedTable.name
      });
      
      const errorMessage = error.response?.data?.error || 'Error al ejecutar la consulta';
      toast.error(errorMessage);
      setResults({ error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const formatColumnType = (type) => {
    const typeMap = {
      'string': 'TEXT',
      'integer': 'INT',
      'float': 'FLOAT',
      'boolean': 'BOOLEAN',
      'date': 'DATE'
    };
    return typeMap[type] || type.toUpperCase();
  };

  return (
    <div className="queries-container">
      <h2 className="mb-4">
        <FaDatabase className="me-2" />
        Consultas SQL
      </h2>

      <div className="row h-100">
        {/* Panel izquierdo - Tablas (1/4 de la pantalla) */}
        <div className="col-md-3">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <FaTable className="me-2" />
                Tablas Disponibles
              </h5>
              <button 
                className="btn btn-sm btn-outline-primary"
                onClick={loadTables}
                disabled={isLoadingTables}
              >
                <FaEye />
              </button>
            </div>
            <div className="card-body p-0">
              {isLoadingTables ? (
                <div className="text-center p-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Cargando...</span>
                  </div>
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center p-4 text-muted">
                  <FaDatabase className="mb-2" style={{ fontSize: '2rem' }} />
                  <p>No hay tablas disponibles</p>
                  <small>Sube archivos desde el Ingestor</small>
                </div>
              ) : (
                <div className="table-list">
                  {tables.map((table, index) => (
                    <div
                      key={index}
                      className={`table-item ${selectedTable?.name === table.name ? 'active' : ''}`}
                      onClick={() => handleTableSelect(table)}
                    >
                      <div className="table-header">
                        <FaTable className="table-icon" />
                        <span className="table-name">{table.name}</span>
                      </div>
                      <div className="table-info">
                        <small className="text-muted">
                          {table.files.length} archivo{table.files.length !== 1 ? 's' : ''} • 
                          {table.recordCount > 0 ? ` ${table.recordCount} registros` : ' Sin procesar'}
                        </small>
                      </div>
                      {table.description && (
                        <div className="table-description">
                          <small>{table.description}</small>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel derecho - Query y Resultados (3/4 de la pantalla) */}
        <div className="col-md-9">
          <div className="row h-100">
            {/* Zona superior - Editor de Query */}
            <div className="col-12 mb-3">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    <FaColumns className="me-2" />
                    Editor SQL
                  </h5>
                  <button
                    className="btn btn-success"
                    onClick={executeQuery}
                    disabled={isLoading || !query.trim()}
                  >
                    {isLoading ? (
                      <>
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Ejecutando...
                      </>
                    ) : (
                      <>
                        <FaPlay className="me-2" />
                        Ejecutar Query
                      </>
                    )}
                  </button>
                </div>
                <div className="card-body">
                  <textarea
                    className="form-control query-editor"
                    rows="8"
                    placeholder="Escribe tu consulta SQL aquí...&#10;Ejemplo: SELECT * FROM tabla LIMIT 10"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Zona inferior - Resultados */}
            <div className="col-12">
              <div className="card h-100">
                <div className="card-header">
                  <h5 className="mb-0">
                    <FaInfoCircle className="me-2" />
                    Resultados
                  </h5>
                </div>
                <div className="card-body results-container">
                  {results ? (
                    results.error ? (
                      <div className="alert alert-danger">
                        <strong>Error:</strong> {results.error}
                      </div>
                    ) : (
                      <div className="results-content">
                        {results.data && results.data.length > 0 ? (
                          <>
                            <div className="results-info mb-3">
                              <span className="badge bg-success me-2">
                                {results.data.length} fila{results.data.length !== 1 ? 's' : ''}
                              </span>
                              {results.executionTime && (
                                <span className="text-muted">
                                  Tiempo de ejecución: {results.executionTime}ms
                                </span>
                              )}
                            </div>
                            <div className="table-responsive">
                              <table className="table table-striped table-hover">
                                <thead className="table-dark">
                                  <tr>
                                    {Object.keys(results.data[0]).map((column, index) => (
                                      <th key={index}>{column}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {results.data.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {Object.values(row).map((value, colIndex) => (
                                        <td key={colIndex}>
                                          {value === null || value === undefined ? (
                                            <span className="text-muted">NULL</span>
                                          ) : (
                                            String(value)
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <div className="text-center text-muted">
                            <FaInfoCircle className="mb-2" style={{ fontSize: '2rem' }} />
                            <p>La consulta no devolvió resultados</p>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="text-center text-muted">
                      <FaDatabase className="mb-2" style={{ fontSize: '2rem' }} />
                      <p>Ejecuta una consulta para ver los resultados</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para mostrar esquema de tabla */}
      {selectedTable && selectedTable.schema && (
        <div className="schema-info mt-3">
          <div className="card">
            <div className="card-header">
              <h6 className="mb-0">
                <FaColumns className="me-2" />
                Esquema de {selectedTable.name}
              </h6>
            </div>
            <div className="card-body">
              <div className="row">
                {selectedTable.schema.map((column, index) => (
                  <div key={index} className="col-md-4 mb-2">
                    <div className="schema-column">
                      <strong>{column.name}</strong>
                      <span className="badge bg-secondary ms-2">
                        {formatColumnType(column.type)}
                      </span>
                      {column.nullable && (
                        <span className="badge bg-warning ms-1">NULL</span>
                      )}
                      {column.description && (
                        <small className="d-block text-muted">{column.description}</small>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Queries; 