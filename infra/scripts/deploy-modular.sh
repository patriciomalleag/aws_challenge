#!/bin/bash

# Script de despliegue modular para infraestructura
# Optimizado para AWS Academy Learner Lab y GitHub Actions

set -e

# Configuración
STACK_NAME="data-pipeline-stack"
MAIN_TEMPLATE="templates/main.yaml"
MAIN_PARAMETERS="parameters/main.json"
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

# Función para validar prerequisitos
validate_prerequisites() {
    log_info "Validando prerequisitos..."
    
    # Verificar AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI no está instalado"
        exit 1
    fi
    
    # Verificar credenciales AWS
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "Credenciales AWS no configuradas"
        exit 1
    fi
    
    # Verificar archivos de template
    if [[ ! -f "$MAIN_TEMPLATE" ]]; then
        log_error "Template principal no encontrado: $MAIN_TEMPLATE"
        exit 1
    fi
    
    if [[ ! -f "$MAIN_PARAMETERS" ]]; then
        log_error "Archivo de parámetros no encontrado: $MAIN_PARAMETERS"
        exit 1
    fi
    
    log_success "Prerequisitos validados"
}

# Función para validar template
validate_template() {
    log_info "Validando templates de CloudFormation..."
    
    # Validar template principal
    if aws cloudformation validate-template \
        --template-body file://$MAIN_TEMPLATE \
        --region $REGION > /dev/null 2>&1; then
        log_success "Template principal validado correctamente"
    else
        log_error "Error validando template principal"
        exit 1
    fi
    
    # Validar templates anidados
    local templates=("templates/network.yaml" "templates/storage.yaml" "templates/lambda.yaml" "templates/webapp.yaml")
    
    for template in "${templates[@]}"; do
        if aws cloudformation validate-template \
            --template-body file://$template \
            --region $REGION > /dev/null 2>&1; then
            log_success "Template $template validado correctamente"
        else
            log_error "Error validando template $template"
            exit 1
        fi
    done
}

# Función para obtener Account ID
get_account_id() {
    aws sts get-caller-identity --query 'Account' --output text
}

# Función para actualizar parámetros con valores dinámicos
update_parameters() {
    log_info "Actualizando parámetros con valores dinámicos..."
    
    # Obtener Account ID
    ACCOUNT_ID=$(get_account_id)
    log_info "Account ID detectado: $ACCOUNT_ID"
    
    # Crear archivo temporal de parámetros
    TEMP_PARAMS=$(mktemp)
    
    # Leer parámetros base y actualizar con valores dinámicos
    jq -r '.[] | "\(.ParameterKey)=\(.ParameterValue)"' "$MAIN_PARAMETERS" | while IFS='=' read -r key value; do
        case $key in
            "LabRoleArn")
                # Usar LAB_ROLE_ARN de GitHub Secrets si está disponible, sino generar dinámicamente
                ROLE_ARN="${LAB_ROLE_ARN:-arn:aws:iam::$ACCOUNT_ID:role/LabRole}"
                echo "{\"ParameterKey\":\"$key\",\"ParameterValue\":\"$ROLE_ARN\"}" >> "$TEMP_PARAMS"
                ;;
            "S3BucketRaw")
                # Generar nombre de bucket dinámicamente
                BUCKET_NAME="data-pipeline-raw-$ACCOUNT_ID"
                echo "{\"ParameterKey\":\"$key\",\"ParameterValue\":\"$BUCKET_NAME\"}" >> "$TEMP_PARAMS"
                ;;
            "DDBTableName")
                # Generar nombre de tabla dinámicamente
                TABLE_NAME="datasets-catalog"
                echo "{\"ParameterKey\":\"$key\",\"ParameterValue\":\"$TABLE_NAME\"}" >> "$TEMP_PARAMS"
                ;;
            *)
                echo "{\"ParameterKey\":\"$key\",\"ParameterValue\":\"$value\"}" >> "$TEMP_PARAMS"
                ;;
        esac
    done
    
    # Convertir a formato JSON array
    echo "[" > "$MAIN_PARAMETERS.tmp"
    paste -sd ',' "$TEMP_PARAMS" >> "$MAIN_PARAMETERS.tmp"
    echo "]" >> "$MAIN_PARAMETERS.tmp"
    
    # Reemplazar archivo original
    mv "$MAIN_PARAMETERS.tmp" "$MAIN_PARAMETERS"
    rm "$TEMP_PARAMS"
    
    log_success "Parámetros actualizados con valores dinámicos"
}



# Función para subir templates a S3
upload_templates_to_s3() {
    log_info "Subiendo templates a S3..."
    
    # Obtener Account ID
    ACCOUNT_ID=$(get_account_id)
    TEMPLATE_BUCKET="data-pipeline-templates-$ACCOUNT_ID"
    
    # Crear bucket para templates si no existe
    if ! aws s3 ls "s3://$TEMPLATE_BUCKET" >/dev/null 2>&1; then
        log_info "Creando bucket para templates: $TEMPLATE_BUCKET"
        aws s3 mb "s3://$TEMPLATE_BUCKET" --region $REGION
        aws s3api put-bucket-encryption \
            --bucket "$TEMPLATE_BUCKET" \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }'
    fi
    
    # Subir templates
    local templates=("templates/network.yaml" "templates/storage.yaml" "templates/lambda.yaml" "templates/webapp.yaml")
    
    for template in "${templates[@]}"; do
        if [[ -f "$template" ]]; then
            log_info "Subiendo $template..."
            aws s3 cp "$template" "s3://$TEMPLATE_BUCKET/$template"
        else
            log_error "Template no encontrado: $template"
            exit 1
        fi
    done
    
    # Actualizar referencias en main.yaml
    local s3_url="https://$TEMPLATE_BUCKET.s3.$REGION.amazonaws.com"
    sed -i.bak "s|file://templates/|$s3_url/templates/|g" "$MAIN_TEMPLATE"
    
    log_success "Templates subidos a S3 y referencias actualizadas"
}

# Función para desplegar stack
deploy_stack() {
    log_info "Iniciando despliegue de infraestructura..."
    
    # Verificar si el stack existe
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
        log_warning "Stack existe, actualizando..."
        
        aws cloudformation update-stack \
            --stack-name $STACK_NAME \
            --template-body file://$MAIN_TEMPLATE \
            --parameters file://$MAIN_PARAMETERS \
            --capabilities CAPABILITY_IAM \
            --region $REGION
        
        log_info "⏳ Esperando actualización del stack..."
        aws cloudformation wait stack-update-complete \
            --stack-name $STACK_NAME \
            --region $REGION
    else
        log_info "🆕 Creando nuevo stack..."
        
        aws cloudformation create-stack \
            --stack-name $STACK_NAME \
            --template-body file://$MAIN_TEMPLATE \
            --parameters file://$MAIN_PARAMETERS \
            --capabilities CAPABILITY_IAM \
            --region $REGION
        
        log_info "⏳ Esperando creación del stack..."
        aws cloudformation wait stack-create-complete \
            --stack-name $STACK_NAME \
            --region $REGION
    fi
    
    log_success "Despliegue completado exitosamente!"
}

# Función para mostrar outputs
show_outputs() {
    log_info "📊 Salidas del stack:"
    
    aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs' \
        --output table
    
    # Mostrar información adicional
    log_info "🔗 URLs importantes:"
    QUERY_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaQueryURL`].OutputValue' \
        --output text)
    
    if [[ "$QUERY_URL" != "None" ]]; then
        echo "   Lambda Query URL: $QUERY_URL"
    fi
    
    ETL_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaETLURL`].OutputValue' \
        --output text)
    
    if [[ "$ETL_URL" != "None" ]]; then
        echo "   Lambda ETL URL: $ETL_URL"
    fi
    
    WEBAPP_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`WebAppURL`].OutputValue' \
        --output text)
    
    if [[ "$WEBAPP_URL" != "None" ]]; then
        echo "   Web Application URL: $WEBAPP_URL"
    fi
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`APIURL`].OutputValue' \
        --output text)
    
    if [[ "$API_URL" != "None" ]]; then
        echo "   API URL: $API_URL"
    fi
}

# Función para verificar estado de recursos
verify_resources() {
    log_info "Verificando recursos desplegados..."
    
    # Verificar stacks anidados
    NESTED_STACKS=$(aws cloudformation list-stacks \
        --region $REGION \
        --query "StackSummaries[?contains(StackName, '$STACK_NAME') && StackStatus=='CREATE_COMPLETE'].StackName" \
        --output text)
    
    log_success "Stacks desplegados:"
    for stack in $NESTED_STACKS; do
        echo "   - $stack"
    done
    
    # Verificar funciones Lambda
    LAMBDA_FUNCTIONS=$(aws lambda list-functions \
        --region $REGION \
        --query "Functions[?contains(FunctionName, '$STACK_NAME')].FunctionName" \
        --output text)
    
    if [[ -n "$LAMBDA_FUNCTIONS" ]]; then
        log_success "Funciones Lambda:"
        for func in $LAMBDA_FUNCTIONS; do
            echo "   - $func"
        done
    fi
    
    # Verificar buckets S3
    S3_BUCKETS=$(aws s3 ls --region $REGION | grep "$STACK_NAME" || true)
    if [[ -n "$S3_BUCKETS" ]]; then
        log_success "Buckets S3:"
        echo "$S3_BUCKETS"
    fi
    
    # Verificar Application Load Balancer
    ALB_DNS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ApplicationLoadBalancerDNS`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$ALB_DNS" != "None" ]]; then
        log_success "Application Load Balancer:"
        echo "   DNS: $ALB_DNS"
    fi
    
    # Verificar Auto Scaling Group
    ASG_NAME=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`AutoScalingGroupName`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$ASG_NAME" != "None" ]]; then
        log_success "Auto Scaling Group:"
        echo "   Name: $ASG_NAME"
        
        # Verificar instancias EC2
        EC2_INSTANCES=$(aws ec2 describe-instances \
            --region $REGION \
            --filters "Name=tag:Project,Values=data-pipeline" "Name=instance-state-name,Values=running" \
            --query 'Reservations[].Instances[].InstanceId' \
            --output text 2>/dev/null || echo "")
        
        if [[ -n "$EC2_INSTANCES" ]]; then
            log_success "EC2 Instances:"
            for instance in $EC2_INSTANCES; do
                echo "   - $instance"
            done
        fi
    fi
}

# Función para obtener URL de Lambda ETL después del despliegue
get_lambda_etl_url() {
    log_info "Obteniendo URL de Lambda ETL..."
    
    ETL_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaETLURL`].OutputValue' \
        --output text 2>/dev/null || echo "None")
    
    if [[ "$ETL_URL" != "None" ]]; then
        log_success "Lambda ETL URL obtenida: $ETL_URL"
        echo "   Lambda ETL URL: $ETL_URL"
    else
        log_warning "No se pudo obtener la URL de Lambda ETL"
        log_info "Verifica que el template incluya el output LambdaETLURL"
    fi
}

# Función principal
main() {
    log_info "🚀 Iniciando despliegue modular de infraestructura"
    log_info "   Stack: $STACK_NAME"
    log_info "   Región: $REGION"
    
    validate_prerequisites
    update_parameters
    validate_template
    upload_templates_to_s3
    deploy_stack
    show_outputs
    verify_resources
    get_lambda_etl_url
    
    log_success "🎉 Despliegue completado exitosamente!"
}

# Ejecutar función principal
main "$@" 