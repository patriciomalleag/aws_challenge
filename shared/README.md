# Módulo Shared - Utilidades Comunes

## Propósito

Este módulo contiene utilidades, validadores y bibliotecas compartidas entre todos los componentes del sistema. Proporciona funcionalidades comunes para mantener consistencia y evitar duplicación de código.

## Estructura

```
shared/
├── validators/          # Validadores de esquemas y datos
├── utils/              # Utilidades generales
├── constants/          # Constantes del sistema
├── types/              # Definiciones de tipos TypeScript
└── clients/            # Clientes de servicios AWS
```

## Componentes Principales

### Validadores (`validators/`)

- **`csvSchemaValidator.js`** - Validación de esquemas JSON para archivos CSV
- **`sqlQueryValidator.js`** - Sanitización y validación de consultas SQL
- **`fileValidator.js`** - Validación de tipos MIME y tamaños de archivo

### Utilidades (`utils/`)

- **`logger.js`** - Sistema de logging estructurado para CloudWatch
- **`responseFormatter.js`** - Formateo consistente de respuestas HTTP
- **`uuidGenerator.js`** - Generación de identificadores únicos
- **`dateUtils.js`** - Utilidades para manejo de fechas y timestamps

### Constantes (`constants/`)

- **`awsConfig.js`** - Configuración de servicios AWS
- **`fileTypes.js`** - Tipos MIME y extensiones permitidas
- **`errorCodes.js`** - Códigos de error estandarizados

### Tipos (`types/`)

- **`dataset.types.js`** - Interfaces para metadatos de datasets
- **`api.types.js`** - Tipos para respuestas de API
- **`lambda.types.js`** - Tipos para eventos Lambda

### Clientes (`clients/`)

- **`dynamodbClient.js`** - Cliente configurado para DynamoDB
- **`s3Client.js`** - Cliente configurado para S3
- **`duckdbClient.js`** - Cliente para consultas DuckDB

## Uso

### Instalación

```bash
cd shared
npm install
```

### Importación en otros módulos

```javascript
// Validadores
const { validateCsvSchema } = require('../shared/validators/csvSchemaValidator');
const { validateSqlQuery } = require('../shared/validators/sqlQueryValidator');

// Utilidades
const { logger } = require('../shared/utils/logger');
const { formatResponse } = require('../shared/utils/responseFormatter');

// Constantes
const { ALLOWED_FILE_TYPES } = require('../shared/constants/fileTypes');
const { ERROR_CODES } = require('../shared/constants/errorCodes');

// Clientes
const { dynamodbClient } = require('../shared/clients/dynamodbClient');
const { s3Client } = require('../shared/clients/s3Client');
```

## Configuración

### Variables de Entorno

```bash
# Configuración de AWS
AWS_REGION=us-east-1
AWS_PROFILE=default

# Configuración de logging
LOG_LEVEL=info
LOG_GROUP_NAME=/aws/lambda/data-pipeline

# Configuración de validación
MAX_FILE_SIZE_MB=100
MAX_SQL_QUERY_LENGTH=10000
```

### Configuración de Logging

```javascript
const { logger } = require('./utils/logger');

// Uso básico
logger.info('Procesamiento iniciado', { datasetId: '123', step: 'validation' });

// Con contexto estructurado
logger.error('Error en validación', {
  error: error.message,
  datasetId: '123',
  timestamp: new Date().toISOString(),
  stack: error.stack
});
```

## Validación de Esquemas

### Esquema CSV de Ejemplo

```json
{
  "type": "object",
  "properties": {
    "columns": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "type": { "type": "string", "enum": ["string", "number", "date", "boolean"] },
          "required": { "type": "boolean" }
        }
      }
    }
  }
}
```

### Uso del Validador

```javascript
const { validateCsvSchema } = require('./validators/csvSchemaValidator');

const schema = {
  columns: [
    { name: "id", type: "number", required: true },
    { name: "name", type: "string", required: true },
    { name: "email", type: "string", required: false }
  ]
};

const validationResult = validateCsvSchema(csvData, schema);
if (!validationResult.isValid) {
  console.error('Errores de validación:', validationResult.errors);
}
```

## Formateo de Respuestas

### Respuesta Exitosa

```javascript
const { formatResponse } = require('./utils/responseFormatter');

const response = formatResponse(200, {
  message: 'Dataset procesado exitosamente',
  datasetId: 'uuid-123',
  metadata: { rows: 1000, columns: 5 }
});
```

### Respuesta de Error

```javascript
const response = formatResponse(400, {
  error: 'Esquema de archivo inválido',
  details: validationErrors,
  code: 'INVALID_SCHEMA'
});
```

## Testing

```bash
# Ejecutar tests unitarios
npm test

# Ejecutar tests con coverage
npm run test:coverage

# Ejecutar tests de integración
npm run test:integration
```

## Contribución

Al agregar nuevas utilidades:

1. Mantener la estructura modular
2. Incluir documentación JSDoc
3. Agregar tests unitarios
4. Actualizar este README
5. Verificar compatibilidad con todos los módulos

## Dependencias

- `aws-sdk` - Cliente oficial de AWS
- `joi` - Validación de esquemas
- `winston` - Sistema de logging
- `uuid` - Generación de UUIDs
- `moment` - Manejo de fechas
- `duckdb` - Cliente DuckDB para consultas SQL 