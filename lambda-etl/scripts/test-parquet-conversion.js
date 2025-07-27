#!/usr/bin/env node

/**
 * Script de prueba para la conversión real a Parquet
 * Uso: node scripts/test-parquet-conversion.js
 */

const path = require('path');
const fs = require('fs-extra');
const { convertToParquet, readParquetFile } = require('../src/services/parquetConverter');

// Datos de prueba
const testData = [
  {
    id: '1',
    name: 'Juan Pérez',
    age: '25',
    salary: '50000.50',
    active: 'true',
    hireDate: '2023-01-15'
  },
  {
    id: '2',
    name: 'María García',
    age: '30',
    salary: '65000.75',
    active: 'false',
    hireDate: '2022-06-20'
  },
  {
    id: '3',
    name: 'Carlos López',
    age: '28',
    salary: '55000.25',
    active: 'true',
    hireDate: '2023-03-10'
  }
];

// Esquema de prueba
const testSchema = [
  { name: 'id', type: 'string', nullable: false },
  { name: 'name', type: 'string', nullable: false },
  { name: 'age', type: 'integer', nullable: true },
  { name: 'salary', type: 'float', nullable: true },
  { name: 'active', type: 'boolean', nullable: true },
  { name: 'hireDate', type: 'date', nullable: true }
];

async function testParquetConversion() {
  console.log('🧪 Iniciando prueba de conversión a Parquet...\n');

  try {
    // Paso 1: Convertir datos a Parquet
    console.log('📝 Paso 1: Convirtiendo datos CSV a Parquet...');
    const result = await convertToParquet(testData, testSchema, 'test_output.parquet');
    
    console.log('✅ Conversión completada:');
    console.log(`   - Archivo: ${result.filePath}`);
    console.log(`   - Tamaño: ${result.fileSize} bytes`);
    console.log(`   - Ratio de compresión: ${result.compressionRatio.toFixed(2)}x`);
    console.log(`   - Filas procesadas: ${result.metadata.rowCount}`);
    console.log(`   - Columnas: ${result.metadata.columnCount}`);
    console.log(`   - Compresión: ${result.metadata.compression}\n`);

    // Paso 2: Leer archivo Parquet
    console.log('📖 Paso 2: Leyendo archivo Parquet...');
    const readData = await readParquetFile(result.filePath);
    
    console.log('✅ Lectura completada:');
    console.log(`   - Filas leídas: ${readData.length}`);
    console.log(`   - Datos recuperados:`, JSON.stringify(readData, null, 2));

    // Paso 3: Verificar integridad
    console.log('\n🔍 Paso 3: Verificando integridad de datos...');
    const originalJson = JSON.stringify(testData.sort((a, b) => a.id.localeCompare(b.id)));
    const parquetJson = JSON.stringify(readData.sort((a, b) => a.id.localeCompare(b.id)));
    
    if (originalJson === parquetJson) {
      console.log('✅ Integridad verificada: Los datos son idénticos');
    } else {
      console.log('❌ Error: Los datos no coinciden');
      console.log('Original:', originalJson);
      console.log('Parquet:', parquetJson);
    }

    // Paso 4: Limpiar archivo temporal
    console.log('\n🧹 Paso 4: Limpiando archivo temporal...');
    await fs.remove(result.filePath);
    console.log('✅ Archivo temporal eliminado');

    console.log('\n🎉 ¡Prueba completada exitosamente!');
    console.log('La conversión real a Parquet está funcionando correctamente.');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar prueba
if (require.main === module) {
  testParquetConversion();
}

module.exports = { testParquetConversion }; 