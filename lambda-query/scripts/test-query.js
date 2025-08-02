/**
 * Script de prueba para la función Lambda Query
 * Permite probar la funcionalidad de consultas SQL localmente
 * @module lambda-query/scripts/test-query
 */

const { handler } = require('../src/index');

// Configurar variables de entorno para pruebas
process.env.S3_BUCKET_RAW = 'data-pipeline-raw-test';
process.env.DDB_TABLE_NAME = 'datasets-catalog-test';
process.env.MAX_QUERY_TIMEOUT_MS = '30000';
process.env.MAX_RESULT_ROWS = '1000';

/**
 * Simular evento HTTP para probar la función
 */
async function testQueryFunction() {
  console.log('🧪 Iniciando pruebas de la función Lambda Query...\n');

  const context = {
    awsRequestId: 'test-request-' + Date.now(),
    functionName: 'data-pipeline-query-function',
    functionVersion: '$LATEST',
    memoryLimitInMB: '512',
    remainingTimeInMillis: () => 30000
  };

  // Test 1: Health Check
  console.log('📋 Test 1: Health Check');
  try {
    const healthEvent = {
      httpMethod: 'GET',
      path: '/health',
      headers: {},
      queryStringParameters: null
    };

    const healthResponse = await handler(healthEvent, context);
    console.log('✅ Health Check exitoso:', healthResponse.statusCode);
    console.log('📄 Respuesta:', JSON.parse(healthResponse.body));
  } catch (error) {
    console.error('❌ Health Check falló:', error.message);
  }
  console.log('');

  // Test 2: Listar Datasets
  console.log('📋 Test 2: Listar Datasets');
  try {
    const listEvent = {
      httpMethod: 'GET',
      path: '/datasets',
      headers: {},
      queryStringParameters: null
    };

    const listResponse = await handler(listEvent, context);
    console.log('✅ Listar Datasets exitoso:', listResponse.statusCode);
    console.log('📄 Respuesta:', JSON.parse(listResponse.body));
  } catch (error) {
    console.error('❌ Listar Datasets falló:', error.message);
  }
  console.log('');

  // Test 3: Ejecutar Query (requiere archivos CSV reales)
  console.log('📋 Test 3: Ejecutar Query (requiere archivos CSV)');
  console.log('   ⚠️  Este test requiere archivos CSV reales en S3');
  console.log('   💡 Ejecuta: node scripts/test-csv-query.js para pruebas completas');
  console.log('');

  // Test 4: Query con COUNT (requiere archivos CSV reales)
  console.log('📋 Test 4: Query con COUNT (requiere archivos CSV)');
  console.log('   ⚠️  Este test requiere archivos CSV reales en S3');
  console.log('   💡 Ejecuta: node scripts/test-csv-query.js para pruebas completas');
  console.log('');

  // Test 5: Error - Query inválida
  console.log('📋 Test 5: Query inválida (DELETE)');
  try {
    const invalidEvent = {
      httpMethod: 'POST',
      path: '/query',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'DELETE FROM test_table',
        tableName: 'test_table'
      })
    };

    const invalidResponse = await handler(invalidEvent, context);
    console.log('✅ Validación de query exitosa:', invalidResponse.statusCode);
    console.log('📄 Respuesta:', JSON.parse(invalidResponse.body));
  } catch (error) {
    console.error('❌ Validación de query falló:', error.message);
  }
  console.log('');

  // Test 6: Error - Endpoint no encontrado
  console.log('📋 Test 6: Endpoint no encontrado');
  try {
    const notFoundEvent = {
      httpMethod: 'GET',
      path: '/invalid-endpoint',
      headers: {},
      queryStringParameters: null
    };

    const notFoundResponse = await handler(notFoundEvent, context);
    console.log('✅ Manejo de endpoint no encontrado exitoso:', notFoundResponse.statusCode);
    console.log('📄 Respuesta:', JSON.parse(notFoundResponse.body));
  } catch (error) {
    console.error('❌ Manejo de endpoint no encontrado falló:', error.message);
  }
  console.log('');

  console.log('🎉 Pruebas completadas!');
}

/**
 * Función principal
 */
async function main() {
  try {
    await testQueryFunction();
  } catch (error) {
    console.error('💥 Error en las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = { testQueryFunction }; 