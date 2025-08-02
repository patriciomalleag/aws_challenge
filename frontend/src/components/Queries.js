import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FaDatabase, FaPlay, FaEye, FaTable, FaColumns, FaInfoCircle, FaBolt, FaCode, FaChartBar, FaClock, FaRocket } from 'react-icons/fa';
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
        hasResults: !!response.data.data,
        resultsLength: response.data.data ? response.data.data.length : 0
      });
      
      // DEBUG: Logs adicionales para diagnosticar el problema
      console.log('[DEBUG-FRONTEND] Respuesta completa:', response);
      console.log('[DEBUG-FRONTEND] response.data completo:', response.data);
      console.log('[DEBUG-FRONTEND] response.data tipo:', typeof response.data);
      console.log('[DEBUG-FRONTEND] response.data.data:', response.data.data);
      console.log('[DEBUG-FRONTEND] response.data.data tipo:', typeof response.data.data);
      console.log('[DEBUG-FRONTEND] response.data.data es array:', Array.isArray(response.data.data));
      if (response.data.data) {
        console.log('[DEBUG-FRONTEND] Primeros elementos de response.data.data:', response.data.data.slice(0, 2));
      }

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
    <div className="queries-container-modern animate-fadeIn">
      {/* Header del Query Engine */}
      <div className="queries-header">
        <div className="header-content">
          <h1 className="queries-title">
            <FaBolt className="title-icon" />
            SQL Query Engine
          </h1>
          <p className="queries-subtitle">
            Ejecuta consultas SQL potentes sobre tus datasets con rendimiento optimizado
          </p>
        </div>
        
        <div className="query-stats">
          <div className="stat-card">
            <div className="stat-icon tables">
              <FaTable />
            </div>
            <div className="stat-content">
              <div className="stat-number">{tables.length}</div>
              <div className="stat-label">Tablas</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon performance">
              <FaRocket />
            </div>
            <div className="stat-content">
              <div className="stat-number">SQLite</div>
              <div className="stat-label">Engine</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon speed">
              <FaClock />
            </div>
            <div className="stat-content">
              <div className="stat-number">~1s</div>
              <div className="stat-label">Avg Query</div>
            </div>
          </div>
        </div>
      </div>

      <div className="queries-layout">
        {/* Panel izquierdo - Tablas */}
        <div className="tables-panel">
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title">
                <FaDatabase className="panel-icon" />
                Datasets Disponibles
              </h3>
              <button 
                className="refresh-btn"
                onClick={loadTables}
                disabled={isLoadingTables}
                title="Refrescar tablas"
              >
                <FaEye className={isLoadingTables ? 'animate-pulse' : ''} />
              </button>
            </div>
            
            <div className="panel-content">
              {isLoadingTables ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Cargando datasets...</p>
                </div>
              ) : tables.length === 0 ? (
                <div className="empty-tables-state">
                  <FaDatabase className="empty-icon" />
                  <h4>No hay datasets</h4>
                  <p>Sube archivos desde el Ingestor para comenzar</p>
                </div>
              ) : (
                <div className="tables-list">
                  {tables.map((table, index) => (
                    <div
                      key={index}
                      className={`table-card ${selectedTable?.name === table.name ? 'selected' : ''} animate-slideIn`}
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => handleTableSelect(table)}
                    >
                      <div className="table-card-header">
                        <div className="table-card-icon">
                          <FaTable />
                        </div>
                        <div className="table-card-status">
                          {table.recordCount > 0 ? (
                            <div className="status-dot ready"></div>
                          ) : (
                            <div className="status-dot processing"></div>
                          )}
                        </div>
                      </div>
                      
                      <div className="table-card-content">
                        <h4 className="table-card-name">{table.name}</h4>
                        <div className="table-card-stats">
                          <span className="stat">
                            {table.files.length} archivo{table.files.length !== 1 ? 's' : ''}
                          </span>
                          <span className="stat">
                            {table.recordCount > 0 ? `${table.recordCount.toLocaleString()} registros` : 'Procesando'}
                          </span>
                        </div>
                        {table.description && (
                          <p className="table-card-description">{table.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel derecho - Query y Resultados */}
        <div className="query-panel">
          {/* Editor SQL Modernizado */}
          <div className="editor-section">
            <div className="panel-card">
              <div className="panel-header">
                <h3 className="panel-title">
                  <FaCode className="panel-icon" />
                  Editor SQL
                </h3>
                <div className="editor-actions">
                  {selectedTable && (
                    <div className="selected-table-info">
                      <FaTable className="table-info-icon" />
                      <span>{selectedTable.name}</span>
                    </div>
                  )}
                  <button
                    className={`execute-btn ${isLoading ? 'loading' : ''}`}
                    onClick={executeQuery}
                    disabled={isLoading || !query.trim() || !selectedTable}
                  >
                    {isLoading ? (
                      <div className="executing-content">
                        <div className="execute-spinner"></div>
                        <span>Ejecutando...</span>
                      </div>
                    ) : (
                      <div className="execute-content">
                        <FaPlay className="execute-icon" />
                        <span>Ejecutar Query</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="editor-content">
                <div className="editor-toolbar">
                  <div className="editor-info">
                    <span className="editor-mode">SQL</span>
                    {query.trim() && (
                      <span className="char-count">{query.length} caracteres</span>
                    )}
                  </div>
                  
                  <div className="editor-hints">
                    <span className="hint">⌘ + Enter para ejecutar</span>
                  </div>
                </div>
                
                <textarea
                  className="sql-editor"
                  rows="10"
                  placeholder={selectedTable 
                    ? `-- Consulta SQL para ${selectedTable.name}\nSELECT * FROM "${selectedTable.name}" LIMIT 10;`
                    : "-- Selecciona una tabla primero\n-- Luego escribe tu consulta SQL aquí...\n-- Ejemplo: SELECT * FROM tabla LIMIT 10;"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isLoading && query.trim() && selectedTable) {
                      executeQuery();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Resultados Modernizados */}
          <div className="results-section">
            <div className="panel-card">
              <div className="panel-header">
                <h3 className="panel-title">
                  <FaChartBar className="panel-icon" />
                  Resultados
                </h3>
                {results && results.data && results.data.length > 0 && (
                  <div className="results-stats">
                    <div className="result-stat">
                      <span className="stat-value">{results.data.length}</span>
                      <span className="stat-label">filas</span>
                    </div>
                    {results.executionTime && (
                      <div className="result-stat">
                        <span className="stat-value">{results.executionTime}</span>
                        <span className="stat-label">ms</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="results-content">
                {results ? (
                  results.error ? (
                    <div className="error-state">
                      <div className="error-icon">⚠️</div>
                      <div className="error-content">
                        <h4>Error en la consulta</h4>
                        <p>{results.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="results-data">
                      {results.data && results.data.length > 0 ? (
                        <div className="data-table-container">
                          <div className="data-table-scroll">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  {Object.keys(results.data[0]).map((column, index) => (
                                    <th key={index} className="data-header">
                                      <div className="header-content">
                                        <span className="header-name">{column}</span>
                                        <span className="header-type">
                                          {typeof results.data[0][column] === 'number' ? 'NUM' : 
                                           typeof results.data[0][column] === 'boolean' ? 'BOOL' : 'TEXT'}
                                        </span>
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {results.data.map((row, rowIndex) => (
                                  <tr key={rowIndex} className="data-row">
                                    {Object.values(row).map((value, colIndex) => (
                                      <td key={colIndex} className="data-cell">
                                        {value === null || value === undefined ? (
                                          <span className="null-value">NULL</span>
                                        ) : typeof value === 'number' ? (
                                          <span className="number-value">{value.toLocaleString()}</span>
                                        ) : typeof value === 'boolean' ? (
                                          <span className={`boolean-value ${value ? 'true' : 'false'}`}>
                                            {value ? 'TRUE' : 'FALSE'}
                                          </span>
                                        ) : (
                                          <span className="text-value">{String(value)}</span>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="empty-results-state">
                          <FaInfoCircle className="empty-results-icon" />
                          <h4>Sin resultados</h4>
                          <p>La consulta se ejecutó correctamente pero no devolvió datos</p>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="no-query-state">
                    <FaBolt className="no-query-icon" />
                    <h4>¿Listo para consultar?</h4>
                    <p>Selecciona una tabla y escribe tu consulta SQL para comenzar</p>
                    {!selectedTable && (
                      <div className="query-tip">
                        <strong>Tip:</strong> Primero selecciona una tabla de la lista
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schema Panel - Solo se muestra si hay esquema */}
      {selectedTable && selectedTable.schema && (
        <div className="schema-panel animate-slideIn">
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title">
                <FaColumns className="panel-icon" />
                Esquema: {selectedTable.name}
              </h3>
              <div className="schema-stats">
                <span className="schema-stat">
                  {selectedTable.schema.length} columnas
                </span>
              </div>
            </div>
            
            <div className="schema-content">
              <div className="schema-grid">
                {selectedTable.schema.map((column, index) => (
                  <div key={index} className="schema-column-card">
                    <div className="column-header">
                      <div className="column-name">{column.name}</div>
                      <div className="column-badges">
                        <span className={`type-badge ${column.type.toLowerCase()}`}>
                          {formatColumnType(column.type)}
                        </span>
                        {column.nullable && (
                          <span className="nullable-badge">NULL</span>
                        )}
                      </div>
                    </div>
                    {column.description && (
                      <div className="column-description">
                        {column.description}
                      </div>
                    )}
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