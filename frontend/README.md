# Frontend - Aplicación SPA

## Propósito

Este módulo implementa una aplicación de página única (SPA) que proporciona una interfaz web intuitiva para la carga de archivos CSV, ejecución de consultas SQL y visualización de datos. Diseñada con React y optimizada para una experiencia de usuario moderna y responsiva.

## Arquitectura

```
Browser → React SPA → Backend API → AWS Services
```

## Funcionalidades Principales

### 📁 Carga de Archivos
- Interfaz drag & drop para archivos CSV
- Validación de tipos MIME y tamaños
- Indicador de progreso de carga
- Manejo de errores de red
- Reintentos automáticos

### 🔍 Editor SQL
- Editor con resaltado de sintaxis
- Autocompletado básico
- Validación de consultas
- Historial de consultas ejecutadas
- Plantillas de consultas comunes

### 📊 Visualización de Datos
- Tabla interactiva con paginación
- Filtros dinámicos por columna
- Ordenamiento ascendente/descendente
- Exportación a CSV/JSON
- Gráficos básicos (opcional)

### 🔐 Gestión de Estado
- Estado global con Context API
- Autenticación ligera
- Persistencia de preferencias
- Cache de datos

## Estructura del Proyecto

```
frontend/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── index.js              # Punto de entrada
│   ├── App.js                # Componente principal
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.js     # Header de la aplicación
│   │   │   ├── Footer.js     # Footer de la aplicación
│   │   │   ├── Loading.js    # Componente de carga
│   │   │   └── ErrorBoundary.js # Manejo de errores
│   │   ├── upload/
│   │   │   ├── FileUpload.js # Componente de carga de archivos
│   │   │   ├── FileDropzone.js # Zona de drag & drop
│   │   │   └── UploadProgress.js # Indicador de progreso
│   │   ├── query/
│   │   │   ├── SqlEditor.js  # Editor SQL
│   │   │   ├── QueryHistory.js # Historial de consultas
│   │   │   └── QueryTemplates.js # Plantillas de consultas
│   │   └── data/
│   │       ├── DataTable.js  # Tabla de datos
│   │       ├── DataFilters.js # Filtros de datos
│   │       └── DataExport.js # Exportación de datos
│   ├── pages/
│   │   ├── Home.js           # Página principal
│   │   ├── Upload.js         # Página de carga
│   │   ├── Query.js          # Página de consultas
│   │   ├── Datasets.js       # Página de datasets
│   │   └── Dashboard.js      # Dashboard principal
│   ├── services/
│   │   ├── api.js            # Cliente de API
│   │   ├── auth.js           # Servicio de autenticación
│   │   └── storage.js        # Servicio de almacenamiento
│   ├── hooks/
│   │   ├── useApi.js         # Hook para llamadas API
│   │   ├── useLocalStorage.js # Hook para localStorage
│   │   └── useDebounce.js    # Hook para debounce
│   ├── context/
│   │   ├── AppContext.js     # Contexto principal
│   │   └── AuthContext.js    # Contexto de autenticación
│   ├── utils/
│   │   ├── constants.js      # Constantes
│   │   ├── helpers.js        # Utilidades
│   │   └── validators.js     # Validadores
│   └── styles/
│       ├── index.css         # Estilos globales
│       ├── components.css    # Estilos de componentes
│       └── themes.css        # Temas de la aplicación
├── package.json
└── tests/
    ├── unit/
    └── integration/
```

## Configuración

### Variables de Entorno

```bash
# Configuración de la aplicación
REACT_APP_NAME=Data Pipeline
REACT_APP_VERSION=1.0.0
REACT_APP_ENVIRONMENT=development

# URLs de servicios
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_LAMBDA_QUERY_URL=https://your-lambda-url.amazonaws.com

# Configuración de archivos
REACT_APP_MAX_FILE_SIZE_MB=100
REACT_APP_ALLOWED_FILE_TYPES=text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

# Configuración de consultas
REACT_APP_MAX_QUERY_LENGTH=10000
REACT_APP_MAX_RESULT_ROWS=10000

# Configuración de autenticación
REACT_APP_AUTH_ENABLED=false
REACT_APP_JWT_SECRET=your-jwt-secret
```

### Configuración de CORS

```javascript
// Configuración para desarrollo
const corsConfig = {
  origin: process.env.REACT_APP_API_URL || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization']
};
```

## Componentes Principales

### FileUpload Component

```jsx
import React, { useState } from 'react';
import { FileDropzone } from './FileDropzone';
import { UploadProgress } from './UploadProgress';

const FileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = async (files) => {
    setUploading(true);
    setProgress(0);

    try {
      for (const file of files) {
        // Validar archivo
        if (!validateFile(file)) {
          throw new Error('Archivo inválido');
        }

        // Obtener URL prefirmada
        const uploadUrl = await getUploadUrl(file);

        // Subir archivo
        await uploadFile(file, uploadUrl, (progress) => {
          setProgress(progress);
        });
      }

      setUploading(false);
      setProgress(100);
    } catch (error) {
      setUploading(false);
      console.error('Error en carga:', error);
    }
  };

  return (
    <div className="file-upload">
      <FileDropzone onDrop={handleFileUpload} disabled={uploading} />
      {uploading && <UploadProgress progress={progress} />}
    </div>
  );
};
```

### SqlEditor Component

```jsx
import React, { useState, useEffect } from 'react';
import { CodeMirror } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';

const SqlEditor = ({ onExecute, onSave }) => {
  const [query, setQuery] = useState('');
  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    if (!query.trim()) return;

    setExecuting(true);
    try {
      const result = await onExecute(query);
      // Manejar resultado
    } catch (error) {
      console.error('Error ejecutando consulta:', error);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="sql-editor">
      <CodeMirror
        value={query}
        onChange={setQuery}
        extensions={[sql()]}
        theme="dark"
        height="200px"
      />
      <div className="sql-editor-actions">
        <button 
          onClick={handleExecute} 
          disabled={executing || !query.trim()}
        >
          {executing ? 'Ejecutando...' : 'Ejecutar'}
        </button>
        <button onClick={() => onSave(query)}>
          Guardar
        </button>
      </div>
    </div>
  );
};
```

### DataTable Component

```jsx
import React, { useState, useMemo } from 'react';
import { useTable, usePagination, useSortBy, useFilters } from 'react-table';

const DataTable = ({ data, columns }) => {
  const [filterInput, setFilterInput] = useState('');

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    setFilter,
    nextPage,
    previousPage,
    canNextPage,
    canPreviousPage,
    pageOptions,
    state: { pageIndex, pageSize }
  } = useTable(
    {
      columns,
      data,
      initialState: { pageIndex: 0, pageSize: 10 }
    },
    useFilters,
    useSortBy,
    usePagination
  );

  const handleFilterChange = (e) => {
    const value = e.target.value || undefined;
    setFilter('name', value);
    setFilterInput(value);
  };

  return (
    <div className="data-table">
      <input
        value={filterInput}
        onChange={handleFilterChange}
        placeholder="Filtrar datos..."
      />
      
      <table {...getTableProps()}>
        <thead>
          {headerGroups.map(headerGroup => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map(column => (
                <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                  {column.render('Header')}
                  <span>
                    {column.isSorted ? (column.isSortedDesc ? ' ↓' : ' ↑') : ''}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {page.map(row => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => (
                  <td {...cell.getCellProps()}>
                    {cell.render('Cell')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="pagination">
        <button onClick={() => previousPage()} disabled={!canPreviousPage}>
          Anterior
        </button>
        <span>
          Página {pageIndex + 1} de {pageOptions.length}
        </span>
        <button onClick={() => nextPage()} disabled={!canNextPage}>
          Siguiente
        </button>
      </div>
    </div>
  );
};
```

## Servicios

### API Service

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para agregar token de autenticación
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirigir a login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const uploadService = {
  getUploadUrl: (fileData) => api.post('/upload/url', fileData),
  validateFile: (fileData) => api.post('/upload/validate', fileData)
};

export const queryService = {
  executeQuery: (queryData) => api.post('/query/execute', queryData),
  getDatasets: () => api.get('/query/datasets')
};

export const datasetService = {
  getDatasets: () => api.get('/datasets'),
  getDataset: (id) => api.get(`/datasets/${id}`),
  deleteDataset: (id) => api.delete(`/datasets/${id}`)
};
```

### Storage Service

```javascript
const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER_PREFERENCES: 'userPreferences',
  QUERY_HISTORY: 'queryHistory',
  UPLOAD_HISTORY: 'uploadHistory'
};

export const storageService = {
  // Token de autenticación
  getAuthToken: () => localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
  setAuthToken: (token) => localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token),
  removeAuthToken: () => localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN),

  // Preferencias del usuario
  getUserPreferences: () => {
    const prefs = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    return prefs ? JSON.parse(prefs) : {};
  },
  setUserPreferences: (preferences) => {
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
  },

  // Historial de consultas
  getQueryHistory: () => {
    const history = localStorage.getItem(STORAGE_KEYS.QUERY_HISTORY);
    return history ? JSON.parse(history) : [];
  },
  addQueryToHistory: (query) => {
    const history = storageService.getQueryHistory();
    const newHistory = [query, ...history.slice(0, 9)]; // Mantener solo 10 consultas
    localStorage.setItem(STORAGE_KEYS.QUERY_HISTORY, JSON.stringify(newHistory));
  },

  // Historial de cargas
  getUploadHistory: () => {
    const history = localStorage.getItem(STORAGE_KEYS.UPLOAD_HISTORY);
    return history ? JSON.parse(history) : [];
  },
  addUploadToHistory: (upload) => {
    const history = storageService.getUploadHistory();
    const newHistory = [upload, ...history.slice(0, 19)]; // Mantener solo 20 cargas
    localStorage.setItem(STORAGE_KEYS.UPLOAD_HISTORY, JSON.stringify(newHistory));
  }
};
```

## Hooks Personalizados

### useApi Hook

```javascript
import { useState, useEffect, useCallback } from 'react';

export const useApi = (apiCall, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiCall(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    if (dependencies.length > 0) {
      execute(...dependencies);
    }
  }, [execute, ...dependencies]);

  return { data, loading, error, execute };
};
```

### useLocalStorage Hook

```javascript
import { useState, useEffect } from 'react';

export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
};
```

## Manejo de Errores

### ErrorBoundary Component

```jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error capturado por ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Algo salió mal</h2>
          <p>Ha ocurrido un error inesperado. Por favor, recarga la página.</p>
          <button onClick={() => window.location.reload()}>
            Recargar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Estilos y Temas

### CSS Variables para Temas

```css
:root {
  /* Colores principales */
  --primary-color: #007bff;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;
  --info-color: #17a2b8;

  /* Colores de fondo */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-dark: #343a40;

  /* Colores de texto */
  --text-primary: #212529;
  --text-secondary: #6c757d;
  --text-light: #ffffff;

  /* Espaciado */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 3rem;

  /* Bordes */
  --border-radius: 0.375rem;
  --border-color: #dee2e6;

  /* Sombras */
  --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
  --shadow-md: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 1rem 3rem rgba(0, 0, 0, 0.175);
}

/* Tema oscuro */
[data-theme="dark"] {
  --bg-primary: #212529;
  --bg-secondary: #343a40;
  --text-primary: #ffffff;
  --text-secondary: #adb5bd;
  --border-color: #495057;
}
```

## Testing

### Tests Unitarios

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUpload } from '../components/upload/FileUpload';

describe('FileUpload Component', () => {
  test('debe mostrar zona de drop cuando no hay archivos', () => {
    render(<FileUpload />);
    expect(screen.getByText(/arrastra archivos aquí/i)).toBeInTheDocument();
  });

  test('debe manejar archivos válidos', async () => {
    const mockOnUpload = jest.fn();
    render(<FileUpload onUpload={mockOnUpload} />);
    
    const file = new File(['test'], 'test.csv', { type: 'text/csv' });
    const dropzone = screen.getByTestId('file-dropzone');
    
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file]
      }
    });

    expect(mockOnUpload).toHaveBeenCalledWith([file]);
  });
});
```

## Uso

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm start

# Ejecutar tests
npm test

# Build para producción
npm run build
```

### Producción

```bash
# Build optimizado
npm run build

# Servir archivos estáticos
npx serve -s build

# Con nginx
sudo cp -r build/* /var/www/html/
```

### Docker

```bash
# Construir imagen
docker build -t frontend .

# Ejecutar contenedor
docker run -p 3000:80 frontend
```

## Dependencias

### Principales
- `react` - Biblioteca de UI
- `react-dom` - Renderizado de React
- `react-router-dom` - Enrutamiento
- `axios` - Cliente HTTP
- `@uiw/react-codemirror` - Editor de código

### Desarrollo
- `@testing-library/react` - Testing de React
- `@testing-library/jest-dom` - Matchers para testing
- `eslint` - Linting de código
- `prettier` - Formateo de código

## Próximos Pasos

1. Implementar autenticación completa
2. Agregar gráficos con Chart.js
3. Implementar modo offline
4. Agregar notificaciones push
5. Optimizar para PWA 