/**
 * Script de prueba para consultas SQL reales sobre archivos CSV
 * Genera archivos CSV de ejemplo y prueba consultas SQL
 * @module lambda-query/scripts/test-csv-query
 */

const { handler } = require('../src/index');
const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { createObjectCsvWriter } = require('csv-writer');

// Configurar variables de entorno para pruebas
process.env.S3_BUCKET_RAW = 'data-pipeline-raw-test';
process.env.DDB_TABLE_NAME = 'datasets-catalog-test';
process.env.MAX_QUERY_TIMEOUT_MS = '30000';
process.env.MAX_RESULT_ROWS = '1000';

// Configurar AWS para pruebas locales
AWS.config.update({
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test'
});

/**
 * Generar datos de ejemplo
 */
function generateSampleData() {
  const data = [];
  const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
  const statuses = ['active', 'inactive', 'pending'];
  
  for (let i = 1; i <= 100; i++) {
    data.push({
      id: i,
      name: `Product ${i}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
      quantity: Math.floor(Math.random() * 100) + 1,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  return data;
}

/**
 * Crear archivo Parquet de ejemplo
 */
async function createSampleParquetFile(data, filename) {
  try {
    // Crear tabla Arrow
    const table = arrow.Table.from(data);
    
    // Crear directorio temporal
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parquet-test-'));
    const filePath = path.join(tempDir, filename);
    
    // Escribir archivo Parquet
    const writer = arrow.TableWriter.forFile(filePath);
    await writer.write(table);
    await writer.close();
    
    // Leer el archivo para verificar
    const buffer = await fs.readFile(filePath);
    
    console.log(`✅ Archivo Parquet creado: ${filename}`);
    console.log(`   - Filas: ${table.numRows}`);
    console.log(`   - Columnas: ${table.numCols}`);
    console.log(`   - Tamaño: ${buffer.length} bytes`);
    
    return { filePath, buffer, tempDir };
    
  } catch (error) {
    console.error(`❌ Error creando archivo Parquet ${filename}:`, error.message);
    throw error;
  }
}

/**
 * Simular subida a S3
 */
async function simulateS3Upload(filePath, s3Key) {
  try {
    const buffer = await fs.readFile(filePath);
    
    // En un entorno real, aquí se subiría a S3
    console.log(`📤 Simulando subida a S3: ${s3Key}`);
    console.log(`   - Tamaño: ${buffer.length} bytes`);
    
    return {
      key: s3Key,
      size: buffer.length,
      lastModified: new Date()
    };
    
  } catch (error) {
    console.error(`❌ Error simulando subida a S3:`, error.message);
    throw error;
  }
}

/**
 * Probar consultas SQL reales
 */
async function testRealQueries() {
  console.log('🧪 Iniciando pruebas de consultas SQL reales...\n');

  const context = {
    awsRequestId: 'test-request-' + Date.now(),
    functionName: 'data-pipeline-query-function',
    functionVersion: '$LATEST',
    memoryLimitInMB: '512',
    remainingTimeInMillis: () => 30000
  };

  try {
    // 1. Generar datos de ejemplo
    console.log('📊 Generando datos de ejemplo...');
    const sampleData = generateSampleData();
    
    // 2. Crear archivo Parquet
    console.log('📄 Creando archivo Parquet...');
    const { filePath, buffer, tempDir } = await createSampleParquetFile(sampleData, 'products.parquet');
    
    // 3. Simular archivo en S3
    const s3File = await simulateS3Upload(filePath, 'products/products.parquet');
    
    // 4. Probar consultas SQL
    console.log('\n🔍 Probando consultas SQL...\n');
    
    const queries = [
      {
        name: 'SELECT básico',
        query: 'SELECT * FROM products LIMIT 5',
        description: 'Obtener las primeras 5 filas'
      },
      {
        name: 'SELECT con filtros',
        query: 'SELECT id, name, category, price FROM products WHERE price > 500 LIMIT 10',
        description: 'Productos con precio mayor a 500'
      },
      {
        name: 'COUNT',
        query: 'SELECT COUNT(*) as total_products FROM products',
        description: 'Contar total de productos'
      },
      {
        name: 'GROUP BY',
        query: 'SELECT category, COUNT(*) as count, AVG(price) as avg_price FROM products GROUP BY category',
        description: 'Estadísticas por categoría'
      },
      {
        name: 'ORDER BY',
        query: 'SELECT name, price, category FROM products ORDER BY price DESC LIMIT 10',
        description: 'Top 10 productos más caros'
      },
      {
        name: 'WHERE con múltiples condiciones',
        query: 'SELECT * FROM products WHERE category = "Electronics" AND status = "active" LIMIT 5',
        description: 'Electrónicos activos'
      }
    ];

    for (const queryTest of queries) {
      console.log(`📋 ${queryTest.name}: ${queryTest.description}`);
      console.log(`   SQL: ${queryTest.query}`);
      
      try {
        const queryEvent = {
          httpMethod: 'POST',
          path: '/query',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: queryTest.query,
            tableName: 'products'
          })
        };

        const response = await handler(queryEvent, context);
        const result = JSON.parse(response.body);
        
        if (response.statusCode === 200) {
          console.log(`   ✅ Éxito: ${result.data ? result.data.length : 0} filas`);
          if (result.data && result.data.length > 0) {
            console.log(`   📊 Muestra:`, result.data.slice(0, 2));
          }
        } else {
          console.log(`   ❌ Error: ${result.error}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Excepción: ${error.message}`);
      }
      
      console.log('');
    }

    // 5. Limpiar archivos temporales
    await fs.rmdir(tempDir, { recursive: true });
    console.log('🧹 Archivos temporales limpiados');

  } catch (error) {
    console.error('💥 Error en las pruebas:', error);
    throw error;
  }
}

/**
 * Función principal
 */
async function main() {
  try {
    await testRealQueries();
    console.log('🎉 Pruebas de consultas SQL reales completadas!');
  } catch (error) {
    console.error('💥 Error en las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main();
}

module.exports = { testRealQueries, generateSampleData, createSampleParquetFile }; 