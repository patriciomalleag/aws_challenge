# Backend API - Orquestación de Servicios

## Propósito

Este módulo implementa una API REST que actúa como orquestador entre el frontend y los servicios serverless. Proporciona endpoints para generar URLs prefirmadas de S3, invocar consultas SQL y gestionar la comunicación segura entre componentes.

## Arquitectura

```
Frontend → Backend API → AWS Services (S3, Lambda, DynamoDB)
```

## Funcionalidades Principales

### 🔗 Orquestación de Servicios
- Generación de URLs prefirmadas para carga de archivos
- Proxy para consultas SQL a Lambda Query
- Gestión de autenticación y autorización
- Validación centralizada de requests

### 🔒 Seguridad
- Validación de entrada con Joi/Zod
- Sanitización de datos
- Control de CORS
- Rate limiting
- Logging de auditoría

### 📊 Gestión de Datos
- Validación de esquemas de archivos
- Transformación de respuestas
- Manejo de errores centralizado
- Métricas de rendimiento

## Estructura del Proyecto

```
backend-api/
├── src/
│   ├── index.js              # Punto de entrada principal
│   ├── app.js                # Configuración de Express
│   ├── routes/
│   │   ├── upload.js         # Rutas para carga de archivos
│   │   ├── query.js          # Rutas para consultas SQL
│   │   └── datasets.js       # Rutas para gestión de datasets
│   ├── controllers/
│   │   ├── uploadController.js # Controlador de carga
│   │   ├── queryController.js  # Controlador de consultas
│   │   └── datasetController.js # Controlador de datasets
│   ├── services/
│   │   ├── s3Service.js      # Servicio de S3
│   │   ├── lambdaService.js  # Servicio de Lambda
│   │   └── dynamodbService.js # Servicio de DynamoDB
│   ├── middleware/
│   │   ├── auth.js           # Middleware de autenticación
│   │   ├── validation.js     # Middleware de validación
│   │   ├── errorHandler.js   # Manejo de errores
│   │   └── cors.js           # Configuración CORS
│   ├── validators/
│   │   ├── uploadValidators.js # Validadores de carga
│   │   └── queryValidators.js  # Validadores de consultas
│   └── utils/
│       ├── config.js         # Configuración
│       └── helpers.js        # Utilidades
├── package.json
├── serverless.yml           # Configuración serverless (opcional)
└── tests/
    ├── unit/
    └── integration/
```

## Configuración

### Variables de Entorno

```bash
# Configuración del servidor
PORT=3000
NODE_ENV=development

# Configuración de AWS
AWS_REGION=us-east-1
AWS_PROFILE=default

# Servicios AWS
S3_BUCKET_RAW=your-raw-bucket-name
LAMBDA_QUERY_URL=https://your-lambda-url.amazonaws.com
DDB_TABLE_NAME=your-datasets-table

# Configuración de seguridad
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Configuración de archivos
MAX_FILE_SIZE_MB=100
ALLOWED_FILE_TYPES=text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### Configuración de CORS

```javascript
// Configuración CORS para desarrollo y producción
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};
```

## API Endpoints

### Upload Endpoints

#### POST /api/upload/url
Genera una URL prefirmada para carga directa a S3.

**Request:**
```json
{
  "filename": "sales_data_2024.csv",
  "contentType": "text/csv",
  "fileSize": 1048576
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/bucket/...",
    "s3Key": "uploads/uuid-123/sales_data_2024.csv",
    "expiresIn": 3600,
    "fields": {
      "key": "uploads/uuid-123/sales_data_2024.csv",
      "bucket": "raw-bucket",
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": "...",
      "X-Amz-Date": "20240115T103000Z",
      "Policy": "...",
      "X-Amz-Signature": "..."
    }
  }
}
```

#### POST /api/upload/validate
Valida un archivo antes de la carga.

**Request:**
```json
{
  "filename": "sales_data_2024.csv",
  "contentType": "text/csv",
  "fileSize": 1048576,
  "schema": {
    "columns": [
      {
        "name": "id",
        "type": "number",
        "required": true
      }
    ]
  }
}
```

### Query Endpoints

#### POST /api/query/execute
Ejecuta una consulta SQL a través de Lambda Query.

**Request:**
```json
{
  "sql": "SELECT * FROM 's3://bucket/dataset.parquet' LIMIT 10",
  "datasetIds": ["uuid-123"],
  "parameters": {
    "limit": 100,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "columns": ["id", "name", "value"],
    "rows": [
      [1, "Product A", 100.50],
      [2, "Product B", 200.75]
    ],
    "rowCount": 2,
    "executionTime": 1250,
    "queryHash": "abc123"
  }
}
```

#### GET /api/query/datasets
Lista datasets disponibles para consulta.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "datasetId": "uuid-123",
      "name": "sales_data_2024",
      "description": "Datos de ventas 2024",
      "rowCount": 10000,
      "columnCount": 5,
      "lastUpdated": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Dataset Endpoints

#### GET /api/datasets
Lista todos los datasets procesados.

#### GET /api/datasets/:datasetId
Obtiene información detallada de un dataset.

#### DELETE /api/datasets/:datasetId
Elimina un dataset (opcional).

## Flujo de Procesamiento

### 1. Carga de Archivos
```
Frontend → POST /api/upload/url → Validación → URL Prefirmada → S3
```

### 2. Consultas SQL
```
Frontend → POST /api/query/execute → Validación → Lambda Query → S3 Parquet → JSON Response
```

### 3. Gestión de Datasets
```
Frontend → GET /api/datasets → DynamoDB → Lista de Datasets
```

## Validación de Entrada

### Esquemas de Validación

```javascript
// Validación de carga de archivos
const uploadUrlSchema = Joi.object({
  filename: Joi.string().required().max(255),
  contentType: Joi.string().required().valid('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  fileSize: Joi.number().required().max(100 * 1024 * 1024) // 100MB
});

// Validación de consultas SQL
const querySchema = Joi.object({
  sql: Joi.string().required().max(10000),
  datasetIds: Joi.array().items(Joi.string().uuid()).optional(),
  parameters: Joi.object({
    limit: Joi.number().integer().min(1).max(10000).optional(),
    offset: Joi.number().integer().min(0).optional()
  }).optional()
});
```

### Sanitización

```javascript
// Sanitización de consultas SQL
const sanitizeSql = (sql) => {
  // Remover comentarios
  sql = sql.replace(/--.*$/gm, '');
  
  // Validar palabras clave peligrosas
  const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE'];
  const hasDangerousKeywords = dangerousKeywords.some(keyword => 
    sql.toUpperCase().includes(keyword)
  );
  
  if (hasDangerousKeywords) {
    throw new Error('Consulta SQL contiene palabras clave no permitidas');
  }
  
  return sql.trim();
};
```

## Manejo de Errores

### Middleware de Error

```javascript
const errorHandler = (err, req, res, next) => {
  const { logger } = require('../shared/utils/logger');
  
  logger.error('Error en API', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Formatear respuesta de error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
};
```

### Tipos de Errores

- **400 Bad Request**: Datos de entrada inválidos
- **401 Unauthorized**: Token de autenticación faltante o inválido
- **403 Forbidden**: Acceso denegado
- **404 Not Found**: Recurso no encontrado
- **429 Too Many Requests**: Rate limit excedido
- **500 Internal Server Error**: Error interno del servidor

## Seguridad

### Autenticación

```javascript
// Middleware de autenticación (simulado para desarrollo)
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticación requerido'
    });
  }
  
  // En producción, validar JWT
  try {
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token inválido'
    });
  }
};
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutos
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // máximo 100 requests por ventana
  message: {
    success: false,
    error: 'Demasiadas requests, intente más tarde'
  }
});
```

## Monitorización

### Logging

```javascript
// Middleware de logging
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request procesado', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};
```

### Métricas

- Tiempo de respuesta promedio
- Tasa de éxito/fallo por endpoint
- Número de requests por minuto
- Uso de memoria y CPU

## Uso

### Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Ejecutar tests
npm test

# Linting
npm run lint
```

### Producción

```bash
# Build para producción
npm run build

# Iniciar servidor de producción
npm start

# Con PM2
pm2 start ecosystem.config.js
```

### Docker

```bash
# Construir imagen
docker build -t backend-api .

# Ejecutar contenedor
docker run -p 3000:3000 backend-api
```

## Testing

### Tests Unitarios

```bash
# Ejecutar tests unitarios
npm test

# Con coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Tests de Integración

```bash
# Tests de integración
npm run test:integration

# Tests de API
npm run test:api
```

### Tests de Rendimiento

```bash
# Tests de carga
npm run test:load

# Tests de stress
npm run test:stress
```

## Dependencias

### Principales
- `express` - Framework web
- `aws-sdk` - Cliente AWS
- `joi` - Validación de esquemas
- `cors` - Configuración CORS
- `helmet` - Seguridad HTTP

### Desarrollo
- `nodemon` - Auto-reload
- `jest` - Testing framework
- `supertest` - Testing de API
- `eslint` - Linting de código

## Próximos Pasos

1. Implementar autenticación JWT completa
2. Agregar cache con Redis
3. Implementar WebSockets para notificaciones
4. Agregar documentación con Swagger
5. Implementar métricas con Prometheus 