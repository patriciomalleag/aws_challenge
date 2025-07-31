#!/bin/bash
# Script para diagnosticar problemas en la instancia EC2 remotamente
# Este script se ejecuta desde tu máquina local para revisar la instancia

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funciones de logging
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuración
STACK_NAME="data-pipeline-stack"
REGION="${AWS_REGION:-us-east-1}"

echo "=== DIAGNÓSTICO REMOTO DE INSTANCIA EC2 ==="
echo "Stack: $STACK_NAME"
echo "Región: $REGION"
echo "Fecha: $(date)"
echo

# Obtener ID de la instancia desde CloudFormation
log_info "Obteniendo información de la instancia..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`WebAppInstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    log_error "No se pudo obtener el ID de la instancia desde CloudFormation"
    log_info "Verificando si el stack existe..."
    aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].StackStatus' --output text
    exit 1
fi

log_success "Instance ID encontrado: $INSTANCE_ID"

# Obtener IP pública
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text 2>/dev/null)

if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    log_success "IP Pública: $PUBLIC_IP"
    echo "URL esperada: http://$PUBLIC_IP"
else
    log_warning "No se pudo obtener la IP pública"
fi

# Estado de la instancia
log_info "Verificando estado de la instancia..."
INSTANCE_STATE=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text)

echo "Estado de la instancia: $INSTANCE_STATE"

if [ "$INSTANCE_STATE" != "running" ]; then
    log_error "La instancia no está en estado 'running'"
    exit 1
fi

# Verificar UserData y logs usando Systems Manager
log_info "Intentando acceder a logs vía Systems Manager..."

# Verificar si SSM Agent está disponible
SSM_STATUS=$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --region "$REGION" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "No disponible")

if [ "$SSM_STATUS" = "Online" ]; then
    log_success "SSM Agent disponible, ejecutando diagnósticos..."
    
    # Revisar logs de UserData
    log_info "Revisando logs de UserData..."
    aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["echo \"=== USERDATA LOG ===\"; tail -20 /var/log/userdata.log 2>/dev/null || echo \"Log no encontrado\""]' \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' > /tmp/cmd_userdata.txt
    
    COMMAND_ID=$(cat /tmp/cmd_userdata.txt)
    sleep 3
    
    echo "Logs de UserData:"
    aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null || echo "No se pudieron obtener logs"
    
    echo
    
    # Revisar logs de setup
    log_info "Revisando logs de setup..."
    aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["echo \"=== SETUP LOG ===\"; tail -20 /var/log/setup-ec2.log 2>/dev/null || echo \"Log no encontrado\""]' \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' > /tmp/cmd_setup.txt
    
    COMMAND_ID=$(cat /tmp/cmd_setup.txt)
    sleep 3
    
    echo "Logs de Setup:"
    aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null || echo "No se pudieron obtener logs"
    
    echo
    
    # Estado de nginx
    log_info "Verificando estado de nginx..."
    aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["echo \"=== NGINX STATUS ===\"; systemctl status nginx 2>/dev/null || echo \"nginx no disponible\"; echo; echo \"=== PUERTO 80 ===\"; netstat -tlnp | grep :80 2>/dev/null || echo \"Puerto 80 no en uso\""]' \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' > /tmp/cmd_nginx.txt
    
    COMMAND_ID=$(cat /tmp/cmd_nginx.txt)
    sleep 3
    
    echo "Estado de nginx:"
    aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null || echo "No se pudo obtener estado"
    
    echo
    
    # Archivos importantes
    log_info "Verificando archivos importantes..."
    aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["echo \"=== ARCHIVOS ===\"; echo \"UserData log:\"; ls -la /var/log/userdata.log 2>/dev/null || echo \"No existe\"; echo \"Setup log:\"; ls -la /var/log/setup-ec2.log 2>/dev/null || echo \"No existe\"; echo \"Repositorio:\"; ls -la /opt/webapp/ 2>/dev/null || echo \"No existe\"; echo \"Página web:\"; ls -la /var/www/html/ 2>/dev/null || echo \"No existe\""]' \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' > /tmp/cmd_files.txt
    
    COMMAND_ID=$(cat /tmp/cmd_files.txt)
    sleep 3
    
    echo "Archivos:"
    aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null || echo "No se pudo obtener información"
    
else
    log_warning "SSM Agent no disponible. Status: $SSM_STATUS"
    log_info "Opciones alternativas:"
    echo "1. Conectar vía SSH si tienes key pair configurado"
    echo "2. Usar EC2 Instance Connect si está disponible"
    echo "3. Revisar CloudWatch logs si están configurados"
fi

# Test HTTP básico
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
    log_info "Probando conexión HTTP..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://$PUBLIC_IP" 2>/dev/null || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        log_success "Servidor web responde correctamente (HTTP 200)"
    else
        log_error "Servidor web no responde. HTTP Status: $HTTP_STATUS"
    fi
fi

# Cleanup
rm -f /tmp/cmd_*.txt 2>/dev/null

echo
log_info "Comandos útiles para debugging manual:"
echo "aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo "aws logs describe-log-groups --log-group-name-prefix '/aws/ec2' --region $REGION"

echo
echo "=== FIN DEL DIAGNÓSTICO ==="
