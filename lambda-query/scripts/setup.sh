#!/bin/bash

# Script de configuración para Lambda Query
# Instala dependencias y configura el entorno

set -e

echo "🚀 Configurando Lambda Query..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar Node.js
print_status "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado. Por favor instala Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js encontrado: $NODE_VERSION"

# Verificar npm
print_status "Verificando npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm no está instalado"
    exit 1
fi

NPM_VERSION=$(npm --version)
print_success "npm encontrado: $NPM_VERSION"

# Instalar dependencias
print_status "Instalando dependencias..."
npm install

if [ $? -eq 0 ]; then
    print_success "Dependencias instaladas correctamente"
else
    print_error "Error instalando dependencias"
    exit 1
fi

# Verificar dependencias críticas
print_status "Verificando dependencias críticas..."

# Verificar Apache Arrow
if npm list apache-arrow > /dev/null 2>&1; then
    print_success "Apache Arrow instalado"
else
    print_error "Apache Arrow no está instalado"
    exit 1
fi

# Verificar SQLite3
if npm list sqlite3 > /dev/null 2>&1; then
    print_success "SQLite3 instalado"
else
    print_error "SQLite3 no está instalado"
    exit 1
fi

# Verificar AWS SDK
if npm list aws-sdk > /dev/null 2>&1; then
    print_success "AWS SDK instalado"
else
    print_error "AWS SDK no está instalado"
    exit 1
fi

# Crear archivo de configuración de ejemplo
print_status "Creando archivo de configuración de ejemplo..."
cat > .env.example << EOF
# Configuración de AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Buckets S3
S3_BUCKET_RAW=data-pipeline-raw-ACCOUNT_ID

# DynamoDB
DDB_TABLE_NAME=datasets-catalog

# Configuración de consultas
MAX_QUERY_TIMEOUT_MS=30000
MAX_RESULT_ROWS=1000

# Configuración de Lambda
LAMBDA_MEMORY_SIZE=2048
LAMBDA_TIMEOUT=60
EOF

print_success "Archivo .env.example creado"

# Verificar estructura de directorios
print_status "Verificando estructura de directorios..."

REQUIRED_DIRS=("src" "src/handlers" "src/services" "scripts" "tests")

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        print_success "Directorio $dir existe"
    else
        print_warning "Directorio $dir no existe, creando..."
        mkdir -p "$dir"
    fi
done

# Verificar archivos críticos
print_status "Verificando archivos críticos..."

CRITICAL_FILES=(
    "src/index.js"
    "src/handlers/httpHandler.js"
    "src/services/queryService.js"
    "src/services/datasetService.js"
    "src/services/sqlEngine.js"
    "package.json"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "Archivo $file existe"
    else
        print_error "Archivo crítico $file no existe"
        exit 1
    fi
done

# Ejecutar linting
print_status "Ejecutando linting..."
if npm run lint > /dev/null 2>&1; then
    print_success "Linting pasado"
else
    print_warning "Linting falló, pero continuando..."
fi

# Ejecutar tests básicos
print_status "Ejecutando tests básicos..."
if npm test > /dev/null 2>&1; then
    print_success "Tests básicos pasados"
else
    print_warning "Tests básicos fallaron, pero continuando..."
fi

# Mostrar información de configuración
echo ""
print_success "✅ Configuración completada exitosamente!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Copia .env.example a .env y configura tus variables"
echo "2. Ejecuta: node scripts/test-query.js para pruebas básicas"
echo "3. Ejecuta: node scripts/test-parquet-query.js para pruebas completas"
echo ""
echo "🔧 Comandos útiles:"
echo "  npm start          - Iniciar en modo desarrollo"
echo "  npm test           - Ejecutar tests"
echo "  npm run lint       - Ejecutar linting"
echo "  npm run build      - Construir para producción"
echo ""

print_success "🎉 Lambda Query está listo para usar!" 