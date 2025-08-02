/**
 * Script para probar la invocación local de la lambda ETL
 * Ayuda a debuggear problemas sin necesidad de desplegar
 */

const handler = require('../src/index').handler;

// Mock del evento de prueba que simula la invocación desde backend-api
const mockEvent = {
  httpMethod: 'POST',
  path: '/process',
  body: JSON.stringify({
    fileId: 'test-file-id-12345',
    bucketName: 'data-pipeline-raw-ACCOUNT_ID',
    objectKey: 'datasets/test-file-id-12345/test.csv',
    tableName: 'test_table',
    directory: 'datasets'
  }),
  headers: {
    'Content-Type': 'application/json'
  }
};

// Mock del contexto Lambda
const mockContext = {
  awsRequestId: 'test-request-id-67890',
  functionName: 'data-pipeline-etl-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:data-pipeline-etl-function',
  memoryLimitInMB: '512',
  getRemainingTimeInMillis: () => 30000,
  logGroupName: '/aws/lambda/data-pipeline-etl-function',
  logStreamName: '2023/08/15/[$LATEST]abcdef123456',
  identity: undefined,
  clientContext: undefined
};

async function testLocalInvocation() {
  console.log('========================================');
  console.log('INICIANDO PRUEBA LOCAL DE LAMBDA ETL');
  console.log('========================================');
  
  console.log('Evento de prueba:', JSON.stringify(mockEvent, null, 2));
  console.log('Contexto de prueba:', JSON.stringify(mockContext, null, 2));
  
  try {
    console.log('\n[TEST] Invocando handler...');
    const result = await handler(mockEvent, mockContext);
    
    console.log('\n========================================');
    console.log('RESULTADO DE LA INVOCACIÓN:');
    console.log('========================================');
    console.log('Status Code:', result.statusCode);
    console.log('Headers:', JSON.stringify(result.headers, null, 2));
    console.log('Body:', result.body);
    
    if (result.statusCode === 200) {
      console.log('\n✅ PRUEBA EXITOSA');
      const responseBody = JSON.parse(result.body);
      console.log('Datos procesados:', JSON.stringify(responseBody.data, null, 2));
    } else {
      console.log('\n❌ PRUEBA FALLÓ');
      const errorBody = JSON.parse(result.body);
      console.log('Error:', errorBody.error);
      console.log('Código:', errorBody.code);
    }
    
  } catch (error) {
    console.log('\n========================================');
    console.log('ERROR EN LA INVOCACIÓN:');
    console.log('========================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.log('\n❌ PRUEBA FALLÓ CON EXCEPCIÓN');
  }
}

// Configurar variables de entorno para prueba local
process.env.NODE_ENV = 'development';
process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET_RAW = 'data-pipeline-raw-ACCOUNT_ID';
process.env.S3_BUCKET_CURATED = 'data-pipeline-curated-ACCOUNT_ID';
process.env.DDB_TABLE_NAME = 'datasets-catalog';

console.log('Variables de entorno configuradas:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- AWS_REGION:', process.env.AWS_REGION);
console.log('- S3_BUCKET_RAW:', process.env.S3_BUCKET_RAW);
console.log('- S3_BUCKET_CURATED:', process.env.S3_BUCKET_CURATED);
console.log('- DDB_TABLE_NAME:', process.env.DDB_TABLE_NAME);

// Ejecutar prueba
testLocalInvocation()
  .then(() => {
    console.log('\n========================================');
    console.log('PRUEBA COMPLETADA');
    console.log('========================================');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n========================================');
    console.error('ERROR FATAL EN PRUEBA:');
    console.error('========================================');
    console.error(error);
    process.exit(1);
  });