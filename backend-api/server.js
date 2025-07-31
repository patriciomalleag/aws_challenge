const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuración de AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Configuración de buckets y tabla
const RAW_BUCKET = process.env.S3_BUCKET_RAW || 'data-pipeline-raw-ACCOUNT_ID';
const CURATED_BUCKET = process.env.S3_BUCKET_CURATED || 'data-pipeline-curated-ACCOUNT_ID';
const DDB_TABLE = process.env.DDB_TABLE_NAME || 'datasets-catalog';
const LAMBDA_QUERY_FUNCTION_NAME = process.env.LAMBDA_QUERY_FUNCTION_NAME || 'data-pipeline-query-function';
const LAMBDA_ETL_FUNCTION_NAME = process.env.LAMBDA_ETL_FUNCTION_NAME || 'data-pipeline-etl-function';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por ventana
});
app.use(limiter);

// Configuración de multer para subida de archivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV'), false);
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes

// Obtener archivos existentes
app.get('/api/files', async (req, res) => {
  try {
    const params = {
      TableName: DDB_TABLE,
      ProjectionExpression: 'tableName, fileName, directory, status, createdAt, description'
    };

    const result = await dynamodb.scan(params).promise();
    
    const files = result.Items.map(item => ({
      name: item.fileName,
      directory: item.directory,
      tableName: item.tableName,
      status: item.status || 'pending',
      createdAt: item.createdAt,
      description: item.description
    }));

    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Error al obtener archivos' });
  }
});

// Subir archivo CSV
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    const config = JSON.parse(req.body.config);
    const schema = JSON.parse(req.body.schema);

    // Validar configuración
    if (!config.tableName || !config.directory) {
      return res.status(400).json({ error: 'Nombre de tabla y directorio son requeridos' });
    }

    if (!schema || !Array.isArray(schema) || schema.length === 0) {
      return res.status(400).json({ error: 'El esquema no puede estar vacío y debe ser un array' });
    }

    // Validar que cada campo del esquema tenga nombre y tipo
    for (const field of schema) {
      if (!field.name || !field.type) {
        return res.status(400).json({ error: 'Cada campo del esquema debe tener nombre y tipo' });
      }
    }

    const fileId = uuidv4();
    const fileName = req.file.originalname;
    const s3Key = `${config.directory}/${fileId}/${fileName}`;
    const schemaKey = `${config.directory}/${fileId}/schema.json`;

    // Subir archivo CSV al bucket RAW
    const uploadParams = {
      Bucket: RAW_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: 'text/csv',
      Metadata: {
        'table-name': config.tableName,
        'directory': config.directory,
        'separator': config.separator,
        'file-id': fileId,
        'original-name': fileName
      }
    };

    await s3.upload(uploadParams).promise();

    // Subir esquema JSON al bucket RAW
    const schemaParams = {
      Bucket: RAW_BUCKET,
      Key: schemaKey,
      Body: JSON.stringify({
        tableName: config.tableName,
        directory: config.directory,
        schema: schema,
        config: config,
        fileId: fileId,
        fileName: fileName,
        createdAt: new Date().toISOString()
      }, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'table-name': config.tableName,
        'file-id': fileId
      }
    };

    await s3.upload(schemaParams).promise();

    // Guardar metadatos en DynamoDB
    const ddbParams = {
      TableName: DDB_TABLE,
      Item: {
        tableName: config.tableName,
        fileId: fileId,
        fileName: fileName,
        directory: config.directory,
        s3Key: s3Key,
        schemaKey: schemaKey,
        schema: schema,
        config: config,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: config.description || '',
        recordCount: 0, // Se actualizará después del procesamiento
        fileSize: req.file.size
      }
    };

    await dynamodb.put(ddbParams).promise();

    // Invocar Lambda ETL para procesar el archivo
    try {
      const lambdaParams = {
        FunctionName: LAMBDA_ETL_FUNCTION_NAME,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          httpMethod: 'POST',
          path: '/process',
          body: JSON.stringify({
            fileId: fileId,
            bucketName: RAW_BUCKET,
            objectKey: s3Key,
            tableName: config.tableName,
            directory: config.directory
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        })
      };

      const lambda = new AWS.Lambda();
      const lambdaResponse = await lambda.invoke(lambdaParams).promise();

      if (lambdaResponse.StatusCode !== 200) {
        throw new Error('Error en la función Lambda ETL');
      }

      const responsePayload = JSON.parse(lambdaResponse.Payload);
      
      if (responsePayload.statusCode >= 400) {
        const errorBody = JSON.parse(responsePayload.body);
        console.error('Error en Lambda ETL:', errorBody.error);
        
        // No fallar la respuesta completa, pero registrar el error
        res.json({
          success: true,
          fileId: fileId,
          message: 'Archivo subido correctamente, pero falló el procesamiento ETL',
          s3Key: s3Key,
          schemaKey: schemaKey,
          etlError: errorBody.error
        });
        return;
      }

      const etlResult = JSON.parse(responsePayload.body);
      
      res.json({
        success: true,
        fileId: fileId,
        message: 'Archivo subido y procesado correctamente',
        s3Key: s3Key,
        schemaKey: schemaKey,
        etlResult: etlResult.data
      });

    } catch (etlError) {
      console.error('Error invocando Lambda ETL:', etlError);
      
      // No fallar la respuesta completa, el archivo ya fue subido exitosamente
      res.json({
        success: true,
        fileId: fileId,
        message: 'Archivo subido correctamente, pero falló el procesamiento ETL',
        s3Key: s3Key,
        schemaKey: schemaKey,
        etlError: etlError.message
      });
    }

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// Obtener detalles de un archivo específico
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const params = {
      TableName: DDB_TABLE,
      Key: {
        fileId: fileId
      }
    };

    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.json(result.Item);
  } catch (error) {
    console.error('Error fetching file details:', error);
    res.status(500).json({ error: 'Error al obtener detalles del archivo' });
  }
});

// Obtener esquema de una tabla
app.get('/api/schema/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;

    const params = {
      TableName: DDB_TABLE,
      FilterExpression: 'tableName = :tableName',
      ExpressionAttributeValues: {
        ':tableName': tableName
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    if (result.Items.length === 0) {
      return res.status(404).json({ error: 'Tabla no encontrada' });
    }

    // Obtener el esquema más reciente
    const latestSchema = result.Items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];

    res.json({
      tableName: latestSchema.tableName,
      schema: latestSchema.schema,
      description: latestSchema.description,
      lastUpdated: latestSchema.createdAt
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({ error: 'Error al obtener esquema' });
  }
});

// Ejecutar consulta SQL
app.post('/api/query', async (req, res) => {
  try {
    const { query, tableName } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query es requerida' });
    }

    // Validar que la query no sea maliciosa
    const sanitizedQuery = query.trim().toLowerCase();
    if (sanitizedQuery.includes('drop') || sanitizedQuery.includes('delete') || 
        sanitizedQuery.includes('update') || sanitizedQuery.includes('insert') ||
        sanitizedQuery.includes('create') || sanitizedQuery.includes('alter')) {
      return res.status(400).json({ error: 'Solo se permiten consultas SELECT' });
    }

    // Configurar parámetros para la Lambda Query
    const lambdaParams = {
      FunctionName: LAMBDA_QUERY_FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        httpMethod: 'POST',
        path: '/query',
        body: JSON.stringify({
          query: query.trim(),
          tableName: tableName
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
    };

    const lambda = new AWS.Lambda();
    const lambdaResponse = await lambda.invoke(lambdaParams).promise();

    if (lambdaResponse.StatusCode !== 200) {
      throw new Error('Error en la función Lambda');
    }

    const responsePayload = JSON.parse(lambdaResponse.Payload);
    
    if (responsePayload.statusCode >= 400) {
      const errorBody = JSON.parse(responsePayload.body);
      return res.status(responsePayload.statusCode).json({
        error: errorBody.error || 'Error al ejecutar la consulta'
      });
    }

    const resultBody = JSON.parse(responsePayload.body);
    res.json(resultBody);

  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({ error: 'Error al ejecutar la consulta' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Archivo demasiado grande' });
    }
  }
  
  res.status(500).json({ error: 'Error interno del servidor' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API docs: http://localhost:${PORT}/api`);
});

module.exports = app; 