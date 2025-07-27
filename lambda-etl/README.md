# Lambda ETL - Procesamiento Serverless

## Propósito

Este módulo implementa una función Lambda que procesa automáticamente archivos CSV cargados en S3, los valida contra esquemas JSON, los convierte a formato Parquet optimizado y cataloga los metadatos en DynamoDB.

## Arquitectura

```
S3 Event (ObjectCreated) → Lambda ETL → Validación → Conversión Parquet → S3 Curated → DynamoDB Catalog
```

## Funcionalidades Principales

### 🔍 Validación de Esquemas
- Verificación dinámica contra esquemas JSON
- Detección de columnas faltantes o adicionales
- Validación de tipos de datos (string, number, date, boolean)
- Manejo de valores requeridos vs opcionales

### 🔄 Transformación ETL
- Descarga temporal del CSV en `/tmp`
- **Conversión real a Parquet** usando la librería `parquetjs`
- Compresión Snappy optimizada para velocidad y tamaño
- Procesamiento por chunks para archivos grandes
- Limpieza automática de archivos temporales
- **Validación de integridad** de datos durante la conversión

### 📊 Catalogación
- Registro de metadatos en DynamoDB
- UUID único por dataset
- Información de esquema serializada
- Ruta S3 del archivo Parquet
- Timestamp de procesamiento
- Versión del dataset

### 🗜️ Conversión a Parquet
- **Conversión real** usando `parquetjs` (no simulada)
- **Tipos de datos soportados**: string, integer, float, boolean, date
- **Compresión Snappy** para optimizar velocidad y tamaño
- **Validación de esquema** antes de la conversión
- **Estadísticas de datos** calculadas automáticamente
- **Progreso de conversión** monitoreado en tiempo real
- **Lectura de archivos Parquet** para verificación

## Estructura del Proyecto

```
lambda-etl/
├── src/
│   ├── index.js              # Punto de entrada principal
│   ├── handlers/
│   │   └── s3EventHandler.js # Manejador de eventos S3
│   ├── services/
│   │   ├── csvProcessor.js   # Procesamiento de CSV
│   │   ├── parquetConverter.js # Conversión a Parquet
│   │   └── catalogService.js # Servicio de catalogación
│   ├── validators/
│   │   └── schemaValidator.js # Validación de esquemas
│   └── utils/
│       ├── fileUtils.js      # Utilidades de archivos
│       └── s3Utils.js        # Utilidades de S3
├── package.json
├── serverless.yml           # Configuración serverless
└── tests/
    ├── unit/
    └── integration/
```

## Pruebas

### Prueba de Conversión a Parquet

Para verificar que la conversión a Parquet funciona correctamente:

```bash
# Instalar dependencias
npm install

# Ejecutar prueba de conversión a Parquet
npm run test-parquet
```

Esta prueba:
- Convierte datos de ejemplo a formato Parquet real
- Verifica la integridad de los datos
- Muestra estadísticas de compresión
- Valida la lectura del archivo Parquet

## Configuración

### Variables de Entorno

```bash
# Buckets S3
S3_BUCKET_RAW=your-raw-bucket-name
S3_BUCKET_CURATED=your-curated-bucket-name

# DynamoDB
DDB_TABLE_NAME=your-datasets-table

# Configuración de procesamiento
MAX_FILE_SIZE_MB=100
CHUNK_SIZE_ROWS=10000
PARQUET_COMPRESSION=snappy

# Configuración de memoria y timeout
LAMBDA_MEMORY_SIZE=1024
LAMBDA_TIMEOUT=300
```

### Esquemas de Validación

Los esquemas se definen en formato JSON y se almacenan en S3 o se pasan como parámetros:

```json
{
  "datasetType": "sales_data",
  "version": "1.0",
  "columns": [
    {
      "name": "id",
      "type": "number",
      "required": true,
      "description": "Identificador único"
    },
    {
      "name": "product_name",
      "type": "string",
      "required": true,
      "maxLength": 255
    },
    {
      "name": "price",
      "type": "number",
      "required": true,
      "min": 0
    },
    {
      "name": "sale_date",
      "type": "date",
      "required": true,
      "format": "YYYY-MM-DD"
    }
  ]
}
```

## Flujo de Procesamiento

### 1. Trigger del Evento
```javascript
// Evento S3 que dispara la función
{
  "Records": [{
    "eventSource": "aws:s3",
    "eventName": "ObjectCreated:Put",
    "s3": {
      "bucket": { "name": "raw-bucket" },
      "object": { "key": "data/sales_2024.csv" }
    }
  }]
}
```

### 2. Validación de Archivo
- Verificación de tipo MIME (text/csv)
- Validación de tamaño máximo
- Descarga temporal del archivo

### 3. Procesamiento CSV
- Lectura línea por línea para archivos grandes
- Validación contra esquema JSON
- Detección de errores de formato

### 4. Conversión Parquet
- Uso de librería `pyarrow` o `duckdb`
- Compresión Snappy para optimización
- Particionamiento por columnas clave

### 5. Catalogación
- Generación de UUID único
- Registro en DynamoDB con metadatos
- Actualización de versiones existentes

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

### Invocación Local

```bash
# Simular evento S3
npm run test-local

# Con archivo de prueba
npm run test-local -- --file=test-data/sample.csv
```

### Testing

```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Tests con coverage
npm run test:coverage
```

## Salidas

### Archivo Parquet
- Ubicación: `s3://curated-bucket/datasets/{uuid}/data.parquet`
- Compresión: Snappy
- Particionamiento: Por columnas de fecha (si aplica)

### Metadatos en DynamoDB
```json
{
  "datasetId": "uuid-12345",
  "originalFileName": "sales_2024.csv",
  "originalFileSize": 1048576,
  "parquetFileSize": 524288,
  "schema": {
    "columns": [...],
    "version": "1.0"
  },
  "processingStatus": "completed",
  "processingTimestamp": "2024-01-15T10:30:00Z",
  "rowCount": 10000,
  "columnCount": 5,
  "s3Location": {
    "bucket": "curated-bucket",
    "key": "datasets/uuid-12345/data.parquet"
  },
  "version": 1,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

## Manejo de Errores

### Errores de Validación
- Archivo no es CSV válido
- Esquema no coincide con datos
- Columnas faltantes o adicionales
- Tipos de datos incorrectos

### Errores de Procesamiento
- Memoria insuficiente
- Timeout de procesamiento
- Error en conversión Parquet
- Fallo en escritura S3

### Errores de Catalogación
- Fallo en DynamoDB
- Error en generación de UUID
- Conflicto de versiones

## Monitorización

### CloudWatch Logs
- Logs estructurados con contexto
- Métricas de rendimiento
- Trazabilidad completa del proceso

### Métricas Clave
- Tiempo de procesamiento
- Tamaño de archivos procesados
- Tasa de éxito/fallo
- Uso de memoria

### Alertas
- Errores de procesamiento
- Timeouts frecuentes
- Archivos muy grandes
- Fallos de validación

## Optimizaciones

### Rendimiento
- Procesamiento por chunks
- Compresión optimizada
- Limpieza automática de archivos temporales
- Uso eficiente de memoria

### Escalabilidad
- Configuración de memoria dinámica
- Timeout ajustable
- Procesamiento paralelo para archivos grandes

### Costos
- Compresión eficiente
- Limpieza de archivos temporales
- Optimización de consultas DynamoDB

## Dependencias

### Principales
- `aws-sdk` - Cliente AWS
- `csv-parser` - Procesamiento CSV
- `pyarrow` - Conversión Parquet
- `uuid` - Generación de IDs únicos

### Desarrollo
- `jest` - Testing framework
- `serverless` - Framework de despliegue
- `eslint` - Linting de código

## Próximos Pasos

1. Implementar validación de esquemas dinámica
2. Agregar soporte para archivos Excel
3. Optimizar compresión Parquet
4. Implementar procesamiento paralelo
5. Agregar métricas de calidad de datos 