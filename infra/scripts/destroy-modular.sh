#!/bin/bash

# Script de eliminación modular para infraestructura
# Optimizado para AWS Academy Learner Lab y GitHub Actions

set -e

# Configuración
STACK_NAME="data-pipeline-stack"
REGION="${AWS_REGION:-us-east-1}"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Función para verificar si el stack existe
check_stack_exists() {
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Función para obtener información de recursos antes de eliminar
get_resource_info() {
    log_info "Obteniendo información de recursos..."
    
    # Obtener nombres de buckets S3
    RAW_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketRawName`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    CURATED_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`S3BucketCuratedName`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    # Obtener nombres de funciones Lambda
    ETL_FUNCTION=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaETLFunctionName`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    QUERY_FUNCTION=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaQueryFunctionName`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    echo "RAW_BUCKET=$RAW_BUCKET"
    echo "CURATED_BUCKET=$CURATED_BUCKET"
    echo "ETL_FUNCTION=$ETL_FUNCTION"
    echo "QUERY_FUNCTION=$QUERY_FUNCTION"
}

# Función para vaciar buckets S3
empty_s3_buckets() {
    log_info "🧹 Vaciamiento de buckets S3..."
    
    # Vaciar bucket raw
    if [[ "$RAW_BUCKET" != "None" && "$RAW_BUCKET" != "" ]]; then
        log_info "Vaciamiento bucket raw: $RAW_BUCKET"
        aws s3 rm s3://$RAW_BUCKET --recursive --region $REGION || log_warning "No se pudo vaciar bucket raw"
    fi
    
    # Vaciar bucket curated
    if [[ "$CURATED_BUCKET" != "None" && "$CURATED_BUCKET" != "" ]]; then
        log_info "Vaciamiento bucket curated: $CURATED_BUCKET"
        aws s3 rm s3://$CURATED_BUCKET --recursive --region $REGION || log_warning "No se pudo vaciar bucket curated"
    fi
}

# Función para eliminar logs de CloudWatch
cleanup_cloudwatch_logs() {
    log_info "🧹 Limpieza de logs de CloudWatch..."
    
    # Eliminar log groups de Lambda
    if [[ "$ETL_FUNCTION" != "None" && "$ETL_FUNCTION" != "" ]]; then
        aws logs delete-log-group --log-group-name "/aws/lambda/$ETL_FUNCTION" --region $REGION 2>/dev/null || true
    fi
    
    if [[ "$QUERY_FUNCTION" != "None" && "$QUERY_FUNCTION" != "" ]]; then
        aws logs delete-log-group --log-group-name "/aws/lambda/$QUERY_FUNCTION" --region $REGION 2>/dev/null || true
    fi
}

# Función para eliminar stack
delete_stack() {
    log_info "🗑️ Eliminando stack principal..."
    
    aws cloudformation delete-stack \
        --stack-name $STACK_NAME \
        --region $REGION
    
    log_info "⏳ Esperando eliminación del stack..."
    aws cloudformation wait stack-delete-complete \
        --stack-name $STACK_NAME \
        --region $REGION
}

# Función para verificar eliminación
verify_deletion() {
    log_info "Verificando eliminación de recursos..."
    
    # Verificar que el stack principal fue eliminado
    if ! check_stack_exists; then
        log_success "Stack principal eliminado correctamente"
    else
        log_error "El stack principal aún existe"
        return 1
    fi
    
    # Verificar que los buckets S3 fueron eliminados
    if [[ "$RAW_BUCKET" != "None" && "$RAW_BUCKET" != "" ]]; then
        if ! aws s3 ls s3://$RAW_BUCKET --region $REGION 2>/dev/null; then
            log_success "Bucket raw eliminado"
        else
            log_warning "Bucket raw aún existe"
        fi
    fi
    
    if [[ "$CURATED_BUCKET" != "None" && "$CURATED_BUCKET" != "" ]]; then
        if ! aws s3 ls s3://$CURATED_BUCKET --region $REGION 2>/dev/null; then
            log_success "Bucket curated eliminado"
        else
            log_warning "Bucket curated aún existe"
        fi
    fi
    
    # Verificar que las funciones Lambda fueron eliminadas
    if [[ "$ETL_FUNCTION" != "None" && "$ETL_FUNCTION" != "" ]]; then
        if ! aws lambda get-function --function-name $ETL_FUNCTION --region $REGION 2>/dev/null; then
            log_success "Función ETL eliminada"
        else
            log_warning "Función ETL aún existe"
        fi
    fi
    
    if [[ "$QUERY_FUNCTION" != "None" && "$QUERY_FUNCTION" != "" ]]; then
        if ! aws lambda get-function --function-name $QUERY_FUNCTION --region $REGION 2>/dev/null; then
            log_success "Función Query eliminada"
        else
            log_warning "Función Query aún existe"
        fi
    fi
}

# Función para confirmar eliminación
confirm_deletion() {
    log_warning "⚠️  ADVERTENCIA: Esta acción eliminará TODA la infraestructura del pipeline de datos"
    log_warning "   Stack: $STACK_NAME"
    log_warning "   Región: $REGION"
    echo
    read -p "¿Estás seguro de que quieres continuar? (yes/no): " -r
    echo
    
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        return 0
    else
        log_info "Eliminación cancelada"
        exit 0
    fi
}

# Función principal
main() {
    log_info "🗑️ Iniciando eliminación modular de infraestructura"
    log_info "   Stack: $STACK_NAME"
    log_info "   Región: $REGION"
    
    # Verificar si el stack existe
    if ! check_stack_exists; then
        log_warning "Stack no existe: $STACK_NAME"
        exit 0
    fi
    
    # Confirmar eliminación
    confirm_deletion
    
    # Obtener información de recursos
    get_resource_info
    
    # Vaciar buckets S3
    empty_s3_buckets
    
    # Limpiar logs de CloudWatch
    cleanup_cloudwatch_logs
    
    # Eliminar stack
    delete_stack
    
    # Verificar eliminación
    verify_deletion
    
    log_success "🎉 Eliminación completada exitosamente!"
}

# Ejecutar función principal
main "$@" 