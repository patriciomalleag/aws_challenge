# Lambda Query - Consultas SQL Reales sobre Parquet

## Propósito

Este módulo implementa una función Lambda con URL pública que permite ejecutar consultas SQL **reales** directamente sobre archivos Parquet almacenados en S3, utilizando **Apache Arrow** y **SQLite** como motor de consulta. Proporciona una interfaz REST para consultas analíticas sin necesidad de infraestructura de base de datos persistente.

## Arquitectura

```
HTTP Request → Lambda URL → Apache Arrow → SQLite Engine → S3 Parquet Files → JSON Response
```

## 🚀 **Características Principales**

- ✅ **Consultas SQL reales** sobre archivos Parquet
- ✅ **Apache Arrow** para lectura eficiente de Parquet
- ✅ **SQLite** como motor SQL en memoria
- ✅ **Soporte completo** para SELECT, WHERE, GROUP BY, ORDER BY, etc.
- ✅ **Optimización de memoria** con procesamiento por lotes
- ✅ **Logging detallado** y métricas de rendimiento

## Funcionalidades Principales

### 🔍 Consultas SQL Ad-hoc
- Ejecución de consultas SQL estándar
- Soporte para JOINs entre múltiples datasets
- Funciones agregadas (SUM, COUNT, AVG, etc.)
- Filtros y ordenamiento dinámico
- Paginación de resultados

### 🚀 Optimización de Rendimiento
- DuckDB optimizado para consultas analíticas
- Lectura directa de archivos Parquet en S3
- Compresión y particionamiento automático
- Cache de metadatos de datasets

### 🔒 Seguridad y Validación
- Sanitización de consultas SQL
- Validación de sintaxis
- Límites de tiempo de ejecución
- Control de acceso a datasets

## Estructura del Proyecto

```
lambda-query/
├── src/
│   ├── index.js              # Punto de entrada principal
│   ├── handlers/
│   │   └── httpHandler.js    # Manejador de requests HTTP
│   ├── services/
│   │   ├── queryEngine.js    # Motor de consultas DuckDB
│   │   ├── datasetService.js # Servicio de gestión de datasets
│   │   └── resultFormatter.js # Formateo de resultados
│   ├── validators/
│   │   └── sqlValidator.js   # Validación de consultas SQL
│   └── utils/
│       ├── duckdbUtils.js    # Utilidades de DuckDB
│       └── s3Utils.js        # Utilidades de S3
├── package.json
├── serverless.yml           # Configuración serverless
└── tests/
    ├── unit/
    └── integration/
```

## Configuración

### Variables de Entorno

```bash
# Buckets S3
S3_BUCKET_CURATED=your-curated-bucket-name

# DynamoDB
DDB_TABLE_NAME=your-datasets-table

# Configuración de consultas
MAX_QUERY_TIMEOUT_MS=30000
MAX_RESULT_ROWS=10000
MAX_QUERY_LENGTH=10000

# Configuración de memoria y timeout
LAMBDA_MEMORY_SIZE=2048
LAMBDA_TIMEOUT=60
```

### Configuración de CORS

```yaml
# serverless.yml
functions:
  query:
    events:
      - http:
          path: /query
          method: post
          cors:
            origin: '*'
            headers:
              - Content-Type
              - X-Amz-Date
              - Authorization
              - X-Api-Key
              - X-Amz-Security-Token
            allowCredentials: false
```

## API Endpoints

### POST /query

Ejecuta una consulta SQL sobre los datasets disponibles.

#### Request Body
```json
{
  "sql": "SELECT * FROM 's3://curated-bucket/datasets/uuid-123/data.parquet' LIMIT 10",
  "datasetIds": ["uuid-123", "uuid-456"],
  "parameters": {
    "limit": 100,
    "offset": 0
  }
}
```

#### Response
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "columns": ["id", "name", "value", "date"],
    "rows": [
      [1, "Product A", 100.50, "2024-01-15"],
      [2, "Product B", 200.75, "2024-01-16"]
    ],
    "rowCount": 2,
    "executionTime": 1250,
    "queryPlan": "..."
  },
  "metadata": {
    "datasetsUsed": ["uuid-123"],
    "queryHash": "abc123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### GET /datasets

Lista todos los datasets disponibles para consulta.

#### Response
```json
{
  "success": true,
  "statusCode": 200,
  "data": [
    {
      "datasetId": "uuid-123",
      "name": "sales_data_2024",
      "description": "Datos de ventas 2024",
      "schema": {
        "columns": [...]
      },
      "rowCount": 10000,
      "columnCount": 5,
      "lastUpdated": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GET /datasets/{datasetId}

Obtiene información detallada de un dataset específico.

#### Response
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "datasetId": "uuid-123",
    "name": "sales_data_2024",
    "schema": {
      "columns": [
        {
          "name": "id",
          "type": "number",
          "description": "Identificador único"
        }
      ]
    },
    "statistics": {
      "rowCount": 10000,
      "columnCount": 5,
      "fileSize": 524288,
      "compressionRatio": 0.5
    },
    "s3Location": {
      "bucket": "curated-bucket",
      "key": "datasets/uuid-123/data.parquet"
    }
  }
}
```

## Flujo de Procesamiento

### 1. Validación de Request
- Verificación de método HTTP (POST)
- Validación de formato JSON
- Sanitización de consulta SQL
- Verificación de límites de tamaño

### 2. Análisis de Consulta
- Parseo de consulta SQL
- Identificación de datasets referenciados
- Validación de permisos de acceso
- Optimización de plan de consulta

### 3. Ejecución de Consulta
- Inicialización de DuckDB
- Configuración de conexión S3
- Ejecución de consulta con timeout
- Captura de resultados

### 4. Formateo de Respuesta
- Conversión de resultados a JSON
- Aplicación de paginación
- Cálculo de estadísticas
- Limpieza de recursos

## Tipos de Consultas Soportadas

### Consultas Básicas
```sql
-- Selección simple
SELECT * FROM 's3://bucket/dataset.parquet' LIMIT 10;

-- Con filtros
SELECT name, value FROM 's3://bucket/dataset.parquet' 
WHERE value > 100 AND date >= '2024-01-01';

-- Agregaciones
SELECT category, COUNT(*), AVG(value) 
FROM 's3://bucket/dataset.parquet' 
GROUP BY category;
```

### Consultas con JOINs
```sql
-- JOIN entre datasets
SELECT a.name, b.category, a.value
FROM 's3://bucket/dataset_a.parquet' a
JOIN 's3://bucket/dataset_b.parquet' b ON a.id = b.id
WHERE a.value > 100;
```

### Consultas Avanzadas
```sql
-- Subconsultas
SELECT * FROM (
  SELECT category, AVG(value) as avg_value
  FROM 's3://bucket/dataset.parquet'
  GROUP BY category
) WHERE avg_value > 1000;

-- Funciones de ventana
SELECT name, value,
       ROW_NUMBER() OVER (PARTITION BY category ORDER BY value DESC) as rank
FROM 's3://bucket/dataset.parquet';
```

## Manejo de Errores

### Errores de Validación
- Consulta SQL inválida
- Sintaxis incorrecta
- Referencias a datasets inexistentes
- Límites de tamaño excedidos

### Errores de Ejecución
- Timeout de consulta
- Memoria insuficiente
- Error de acceso a S3
- Fallo en DuckDB

### Errores de Sistema
- Configuración incorrecta
- Variables de entorno faltantes
- Error de inicialización

## Optimizaciones

### Rendimiento
- Pool de conexiones DuckDB
- Cache de metadatos de datasets
- Optimización automática de consultas
- Compresión de respuestas

### Escalabilidad
- Configuración de memoria dinámica
- Timeout ajustable por consulta
- Procesamiento paralelo para consultas complejas

### Costos
- Límites de tiempo de ejecución
- Control de tamaño de resultados
- Optimización de transferencia de datos

## Monitorización

### CloudWatch Logs
- Logs de consultas ejecutadas
- Métricas de rendimiento
- Errores y excepciones
- Uso de recursos

### Métricas Clave
- Tiempo de ejecución promedio
- Número de consultas por minuto
- Tasa de éxito/fallo
- Uso de memoria

### Alertas
- Consultas que exceden timeout
- Errores frecuentes
- Uso alto de memoria
- Consultas sospechosas

## Seguridad

### Validación de Entrada
- Sanitización de consultas SQL
- Validación de parámetros
- Prevención de inyección SQL
- Límites de tamaño de request

### Control de Acceso
- Validación de datasets accesibles
- Límites de consultas por usuario
- Rate limiting
- Auditoría de consultas

### Protección de Datos
- No almacenamiento de datos sensibles
- Logs sin información personal
- Limpieza de archivos temporales
- Encriptación en tránsito

## Uso

### Despliegue

```bash
# Instalar dependencias
npm install

# Desplegar función
npm run deploy

# O usando serverless framework
serverless deploy
```

### Testing

```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Tests de rendimiento
npm run test:performance
```

### Invocación Local

```bash
# Simular request HTTP
npm run test-local

# Con consulta específica
npm run test-local -- --query="SELECT * FROM test LIMIT 5"
```

## Dependencias

### Principales
- `duckdb` - Motor de consultas analíticas
- `aws-sdk` - Cliente AWS
- `uuid` - Generación de IDs únicos
- `sql-parser` - Validación de SQL

### Desarrollo
- `jest` - Testing framework
- `serverless` - Framework de despliegue
- `eslint` - Linting de código

## Próximos Pasos

1. Implementar cache de resultados
2. Agregar soporte para consultas asíncronas
3. Optimizar para datasets muy grandes
4. Implementar autenticación y autorización
5. Agregar soporte para consultas parametrizadas 