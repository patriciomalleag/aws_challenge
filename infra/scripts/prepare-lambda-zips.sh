#!/bin/bash

# Script para crear ZIPs de Lambda automatizados sin instalaciones locales
# Crea versiones simplificadas que usan solo built-ins de Node.js + AWS SDK
# Autor: AWS Academy Challenge
# Versión: 3.0

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logs
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar prerequisitos mínimos
check_prerequisites() {
    log_info "🔍 Verificando prerequisitos..."
    
    # Verificar que estamos en el directorio correcto
    if [[ ! -f "deploy-modular.sh" ]]; then
        log_error "❌ Ejecuta este script desde el directorio infra/scripts/"
        exit 1
    fi
    
    # Verificar que zip está disponible
    if ! command -v zip &> /dev/null; then
        log_error "❌ zip no está instalado"
        log_info "   macOS: zip ya debería estar instalado"
        log_info "   Ubuntu/Debian: sudo apt-get install zip"
        exit 1
    fi
    
    log_success "✅ Prerequisitos verificados"
}

# Preparar directorio de trabajo
setup_workspace() {
    log_info "📁 Configurando workspace..."
    
    WORKSPACE_DIR="../../lambda-zips"
    TEMP_DIR="$WORKSPACE_DIR/temp"
    
    # Crear directorio principal si no existe
    mkdir -p "$WORKSPACE_DIR"
    
    # Limpiar y crear directorio temporal
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"
    
    # Limpiar ZIPs anteriores
    rm -f "$WORKSPACE_DIR"/*.zip
    
    log_success "✅ Workspace preparado"
}

# Crear Lambda ETL simplificado
create_lambda_etl() {
    log_info "📦 Creando Lambda ETL..."
    
    ETL_DIR="$TEMP_DIR/lambda-etl"
    mkdir -p "$ETL_DIR/src" "$ETL_DIR/shared"
    
    # Copiar código fuente
    cp -r "../../lambda-etl/src/"* "$ETL_DIR/src/"
    cp -r "../../shared/"* "$ETL_DIR/shared/"
    
    # Crear package.json simplificado (solo AWS SDK)
    cat > "$ETL_DIR/package.json" << 'EOF'
{
  "name": "lambda-etl",
  "version": "1.0.0",
  "description": "Función Lambda para procesamiento ETL de archivos CSV",
  "main": "src/index.js",
  "dependencies": {
    "aws-sdk": "^2.1450.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
    
    # Crear ZIP
    cd "$ETL_DIR"
    zip -r "../../lambda-etl.zip" . -q
    cd - > /dev/null
    
    log_success "✅ lambda-etl.zip creado"
}

# Crear Lambda Query simplificado
create_lambda_query() {
    log_info "📦 Creando Lambda Query..."
    
    QUERY_DIR="$TEMP_DIR/lambda-query"
    mkdir -p "$QUERY_DIR/src" "$QUERY_DIR/shared"
    
    # Copiar código fuente
    cp -r "../../lambda-query/src/"* "$QUERY_DIR/src/"  
    cp -r "../../shared/"* "$QUERY_DIR/shared/"
    
    # Crear package.json simplificado (solo AWS SDK)
    cat > "$QUERY_DIR/package.json" << 'EOF'
{
  "name": "lambda-query",
  "version": "1.0.0", 
  "description": "Función Lambda para consultas SQL ad-hoc sobre archivos CSV en S3",
  "main": "src/index.js",
  "dependencies": {
    "aws-sdk": "^2.1450.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
    
    # Crear ZIP
    cd "$QUERY_DIR"
    zip -r "../../lambda-query.zip" . -q
    cd - > /dev/null
    
    log_success "✅ lambda-query.zip creado"
}

# Limpiar archivos temporales
cleanup() {
    log_info "🧹 Limpiando archivos temporales..."
    rm -rf "$TEMP_DIR"
    log_success "✅ Limpieza completada"
}

# Mostrar información de los ZIPs creados
show_results() {
    log_info "📊 ZIPs creados:"
    
    WORKSPACE_DIR="../../lambda-zips"
    
    if [[ -f "$WORKSPACE_DIR/lambda-etl.zip" ]]; then
        ETL_SIZE=$(du -h "$WORKSPACE_DIR/lambda-etl.zip" | cut -f1)
        log_success "   📁 lambda-etl.zip: $ETL_SIZE"
    fi
    
    if [[ -f "$WORKSPACE_DIR/lambda-query.zip" ]]; then
        QUERY_SIZE=$(du -h "$WORKSPACE_DIR/lambda-query.zip" | cut -f1)
        log_success "   📁 lambda-query.zip: $QUERY_SIZE"
    fi
    
    log_info ""
    log_info "🎯 ZIPs listos para deployment en: lambda-zips/"
    log_info "💡 Ejecuta: ./deploy-modular.sh"
    log_info "✨ Sin instalaciones locales - solo AWS SDK built-in"
}

# Función principal
main() {
    echo "======================================================"
    echo "🚀 Creando ZIPs de Lambda Automatizados"
    echo "======================================================"
    echo ""
    
    check_prerequisites
    setup_workspace
    create_lambda_etl
    create_lambda_query
    cleanup
    show_results
    
    echo ""
    log_success "🎉 ZIPs creados exitosamente - listos para deployment!"
    echo "======================================================"
}

# Ejecutar función principal
main "$@"