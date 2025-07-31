#!/bin/bash
# Script para forzar la ejecución del setup en la instancia existente

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuración
STACK_NAME="data-pipeline-stack"
REGION="${AWS_REGION:-us-east-1}"

echo "=== FORZAR EJECUCIÓN DEL SETUP ACTUALIZADO ==="
echo "Fecha: $(date)"
echo

# Obtener ID de la instancia
log_info "Obteniendo información de la instancia..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`WebAppInstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    log_error "No se pudo obtener el ID de la instancia"
    exit 1
fi

log_success "Instance ID: $INSTANCE_ID"

# Verificar SSM
SSM_STATUS=$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --region "$REGION" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "No disponible")

if [ "$SSM_STATUS" != "Online" ]; then
    log_error "SSM Agent no disponible. No se puede ejecutar remotamente."
    exit 1
fi

log_success "SSM Agent disponible"

# Paso 1: Actualizar el repositorio
log_info "Actualizando repositorio..."
aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["cd /opt/webapp && git pull origin main"]' \
    --region "$REGION" \
    --output text \
    --query 'Command.CommandId' > /tmp/cmd_git_pull.txt

COMMAND_ID=$(cat /tmp/cmd_git_pull.txt)
sleep 5

PULL_OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'StandardOutputContent' \
    --output text 2>/dev/null)

echo "Git pull output: $PULL_OUTPUT"

# Paso 2: Verificar que el script existe
log_info "Verificando script setup-ec2.sh..."
aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["ls -la /opt/webapp/infra/scripts/setup-ec2.sh"]' \
    --region "$REGION" \
    --output text \
    --query 'Command.CommandId' > /tmp/cmd_check_script.txt

COMMAND_ID=$(cat /tmp/cmd_check_script.txt)
sleep 3

SCRIPT_CHECK=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'StandardOutputContent' \
    --output text 2>/dev/null)

echo "Script check: $SCRIPT_CHECK"

if [[ "$SCRIPT_CHECK" == *"No such file"* ]]; then
    log_error "Script setup-ec2.sh no encontrado después del git pull"
    log_info "Listando contenido de /opt/webapp/infra/scripts/"
    aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["ls -la /opt/webapp/infra/scripts/ || echo \"Directorio no existe\""]' \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' > /tmp/cmd_list_scripts.txt
    
    COMMAND_ID=$(cat /tmp/cmd_list_scripts.txt)
    sleep 3
    
    LIST_OUTPUT=$(aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null)
    
    echo "Contenido de scripts: $LIST_OUTPUT"
    exit 1
fi

# Paso 3: Ejecutar el script setup-ec2.sh
log_info "Ejecutando script setup-ec2.sh..."
aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["cd /opt/webapp && chmod +x infra/scripts/setup-ec2.sh && sudo ./infra/scripts/setup-ec2.sh"]' \
    --region "$REGION" \
    --output text \
    --query 'Command.CommandId' > /tmp/cmd_setup.txt

COMMAND_ID=$(cat /tmp/cmd_setup.txt)
log_info "Ejecutando setup... (puede tomar 1-2 minutos)"
sleep 30

# Verificar el resultado
SETUP_OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'StandardOutputContent' \
    --output text 2>/dev/null)

SETUP_ERROR=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'StandardErrorContent' \
    --output text 2>/dev/null)

echo "=== OUTPUT DEL SETUP ==="
echo "$SETUP_OUTPUT"

if [ -n "$SETUP_ERROR" ]; then
    echo "=== ERRORES DEL SETUP ==="
    echo "$SETUP_ERROR"
fi

# Verificar logs generados
log_info "Verificando logs generados..."
aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["echo \"=== SETUP LOG ===\"; tail -10 /var/log/setup-ec2.log 2>/dev/null || echo \"Log no encontrado\""]' \
    --region "$REGION" \
    --output text \
    --query 'Command.CommandId' > /tmp/cmd_logs.txt

COMMAND_ID=$(cat /tmp/cmd_logs.txt)
sleep 3

LOGS_OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'StandardOutputContent' \
    --output text 2>/dev/null)

echo "=== LOGS DEL SETUP ==="
echo "$LOGS_OUTPUT"

# Test final
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text 2>/dev/null)

if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    log_info "Probando página web actualizada..."
    sleep 5
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://$PUBLIC_IP" 2>/dev/null || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        log_success "Página web responde correctamente"
        log_success "URL: http://$PUBLIC_IP"
        
        # Verificar si el contenido se actualizó
        CONTENT_CHECK=$(curl -s "http://$PUBLIC_IP" | grep -o "Configurado por: infra/scripts/setup-ec2.sh" || echo "No encontrado")
        if [ "$CONTENT_CHECK" != "No encontrado" ]; then
            log_success "Página web actualizada correctamente - setup-ec2.sh se ejecutó"
        else
            log_warning "Página web responde pero puede no estar actualizada"
        fi
    else
        log_error "Problema con la página web. HTTP Status: $HTTP_STATUS"
    fi
fi

# Cleanup
rm -f /tmp/cmd_*.txt 2>/dev/null

echo
echo "=== EJECUCIÓN COMPLETADA ==="
