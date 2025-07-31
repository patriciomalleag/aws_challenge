#!/bin/bash
# Script para diagnosticar problemas en la instancia EC2 remotamente
# Este script se ejecuta desde tu máquina local para revisar la instancia
# Refactorizado para coincidir con setup-ec2.sh

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funciones de logging mejoradas
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_debug() { echo -e "${PURPLE}🔍 $1${NC}"; }
log_section() { echo -e "\n${CYAN}📋 === $1 ===${NC}"; }

# Configuración
STACK_NAME="data-pipeline-stack"
REGION="${AWS_REGION:-us-east-1}"
TEMP_DIR="/tmp/aws-challenge-diagnose-$$"

# Función para cleanup
cleanup() {
    rm -rf "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# Crear directorio temporal
mkdir -p "$TEMP_DIR"

echo "=== DIAGNÓSTICO AVANZADO DE INSTANCIA EC2 ==="
echo "Stack: $STACK_NAME"
echo "Región: $REGION"
echo "Fecha: $(date)"
echo "PID del diagnóstico: $$"
echo

# Obtener información básica de CloudFormation
log_section "INFORMACIÓN DE CLOUDFORMATION"
log_info "Obteniendo información de la instancia desde CloudFormation..."

# Verificar que el stack existe
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    log_error "Stack '$STACK_NAME' no encontrado en región $REGION"
    log_info "Stacks disponibles:"
    aws cloudformation list-stacks --region "$REGION" --query 'StackSummaries[?StackStatus!=`DELETE_COMPLETE`].[StackName,StackStatus]' --output table
    exit 1
fi

log_success "Stack encontrado con estado: $STACK_STATUS"

# Obtener todas las salidas del stack
log_debug "Obteniendo todas las salidas del stack..."
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue,Description]' \
    --output table

INSTANCE_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`WebAppInstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    log_error "No se pudo obtener el ID de la instancia desde CloudFormation"
    log_info "Salidas disponibles del stack:"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
        --output table
    exit 1
fi

log_success "Instance ID encontrado: $INSTANCE_ID"

# Obtener información detallada de la instancia EC2
log_section "INFORMACIÓN DE LA INSTANCIA EC2"

# Obtener detalles completos de la instancia
log_info "Obteniendo detalles de la instancia EC2..."
INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0]')

# Extraer información específica
INSTANCE_STATE=$(echo "$INSTANCE_INFO" | jq -r '.State.Name')
PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress // "N/A"')
PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIpAddress // "N/A"')
INSTANCE_TYPE=$(echo "$INSTANCE_INFO" | jq -r '.InstanceType')
LAUNCH_TIME=$(echo "$INSTANCE_INFO" | jq -r '.LaunchTime')
AZ=$(echo "$INSTANCE_INFO" | jq -r '.Placement.AvailabilityZone')
VPC_ID=$(echo "$INSTANCE_INFO" | jq -r '.VpcId')
SUBNET_ID=$(echo "$INSTANCE_INFO" | jq -r '.SubnetId')
KEY_NAME=$(echo "$INSTANCE_INFO" | jq -r '.KeyName // "N/A"')

echo "Estado de la instancia: $INSTANCE_STATE"
echo "Tipo de instancia: $INSTANCE_TYPE"
echo "IP Pública: $PUBLIC_IP"
echo "IP Privada: $PRIVATE_IP"
echo "Zona de disponibilidad: $AZ"
echo "VPC ID: $VPC_ID"
echo "Subnet ID: $SUBNET_ID"
echo "Key Pair: $KEY_NAME"
echo "Hora de lanzamiento: $LAUNCH_TIME"

if [ "$PUBLIC_IP" != "N/A" ]; then
    log_success "URLs esperadas:"
    echo "  • Aplicación principal: http://$PUBLIC_IP"
    echo "  • API Backend: http://$PUBLIC_IP/api"
    echo "  • Página de status: http://$PUBLIC_IP/status.html"
    echo "  • Explorar repositorio: http://$PUBLIC_IP/repo"
else
    log_warning "No se pudo obtener la IP pública"
fi

if [ "$INSTANCE_STATE" != "running" ]; then
    log_error "La instancia no está en estado 'running'. Estado actual: $INSTANCE_STATE"
    exit 1
fi

# Verificar grupos de seguridad
log_debug "Verificando grupos de seguridad..."
SECURITY_GROUPS=$(echo "$INSTANCE_INFO" | jq -r '.SecurityGroups[].GroupId' | tr '\n' ' ')
echo "Grupos de seguridad: $SECURITY_GROUPS"

for SG in $SECURITY_GROUPS; do
    log_debug "Reglas del grupo $SG:"
    aws ec2 describe-security-groups \
        --group-ids "$SG" \
        --region "$REGION" \
        --query 'SecurityGroups[0].IpPermissions[].[IpProtocol,FromPort,ToPort,IpRanges[0].CidrIp]' \
        --output table 2>/dev/null || echo "  No se pudieron obtener reglas"
done

# Funciones auxiliares para comandos remotos
execute_remote_command() {
    local description="$1"
    local command="$2"
    local timeout="${3:-10}"
    
    log_debug "Ejecutando: $description"
    
    local command_id=$(aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --parameters "commands=[\"$command\"]" \
        --region "$REGION" \
        --output text \
        --query 'Command.CommandId' 2>/dev/null)
    
    if [ -z "$command_id" ]; then
        log_error "No se pudo enviar comando: $description"
        return 1
    fi
    
    # Esperar a que el comando termine
    sleep "$timeout"
    
    # Obtener resultado
    local output=$(aws ssm get-command-invocation \
        --command-id "$command_id" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null)
    
    local error_output=$(aws ssm get-command-invocation \
        --command-id "$command_id" \
        --instance-id "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'StandardErrorContent' \
        --output text 2>/dev/null)
    
    if [ -n "$output" ] && [ "$output" != "None" ]; then
        echo "$output"
    fi
    
    if [ -n "$error_output" ] && [ "$error_output" != "None" ]; then
        echo "STDERR: $error_output" >&2
    fi
    
    return 0
}

# Verificar Systems Manager y ejecutar diagnósticos
log_section "DIAGNÓSTICO VÍA SYSTEMS MANAGER"

log_info "Verificando disponibilidad de SSM Agent..."
SSM_STATUS=$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --region "$REGION" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "No disponible")

echo "Estado de SSM Agent: $SSM_STATUS"

if [ "$SSM_STATUS" = "Online" ]; then
    log_success "SSM Agent disponible, ejecutando diagnósticos detallados..."
    
    # Verificar información del sistema
    log_section "INFORMACIÓN DEL SISTEMA"
    execute_remote_command "Información básica del sistema" \
        "echo '=== SISTEMA ===' && uname -a && echo && echo '=== UPTIME ===' && uptime && echo && echo '=== MEMORIA ===' && free -h && echo && echo '=== DISCO ===' && df -h /" \
        5
    
    # Verificar archivos de logs críticos (basado en setup-ec2.sh)
    log_section "LOGS DE INSTALACIÓN Y SETUP"
    
    # Log de UserData de CloudFormation
    log_info "📄 Revisando log de UserData de CloudFormation..."
    execute_remote_command "UserData log" \
        "if [ -f /var/log/cloud-init-output.log ]; then echo '=== CLOUD-INIT OUTPUT (últimas 30 líneas) ==='; tail -30 /var/log/cloud-init-output.log; else echo 'Cloud-init log no encontrado'; fi" \
        8
    
    # Log de setup-ec2.sh
    log_info "📄 Revisando log de setup-ec2.sh..."
    execute_remote_command "Setup log" \
        "if [ -f /var/log/setup-ec2.log ]; then echo '=== SETUP-EC2 LOG (últimas 40 líneas) ==='; tail -40 /var/log/setup-ec2.log; echo; echo '=== ERRORES EN SETUP ==='; grep -i 'error\\|fail\\|❌' /var/log/setup-ec2.log | tail -10 || echo 'No hay errores evidentes'; else echo 'Setup log no encontrado - esto indica que el setup no se ejecutó'; fi" \
        10
    
    # Verificar estructura de archivos (según setup-ec2.sh)
    log_section "ESTRUCTURA DE ARCHIVOS"
    execute_remote_command "Verificar repositorio y archivos web" \
        "echo '=== REPOSITORIO (/opt/webapp) ===' && ls -la /opt/webapp/ 2>/dev/null || echo 'Repositorio no existe' && echo && echo '=== ARCHIVOS WEB (/var/www/html) ===' && ls -la /var/www/html/ 2>/dev/null || echo 'Directorio web no existe' && echo && echo '=== FRONTEND BUILD ===' && ls -la /opt/webapp/frontend/build/ 2>/dev/null || echo 'Build del frontend no existe'" \
        5
    
    # Verificar servicios críticos
    log_section "ESTADO DE SERVICIOS"
    
    # Estado de nginx
    log_info "🔧 Verificando nginx..."
    execute_remote_command "Estado de nginx" \
        "echo '=== NGINX STATUS ===' && systemctl status nginx --no-pager -l 2>/dev/null || echo 'nginx no disponible' && echo && echo '=== NGINX CONFIG TEST ===' && nginx -t 2>&1 || echo 'Nginx config inválida' && echo && echo '=== PUERTOS EN USO ===' && netstat -tlnp | grep -E ':(80|443)' 2>/dev/null || echo 'Puertos 80/443 no en uso'" \
        8
    
    # Estado del backend (aws-challenge-backend service)
    log_info "🔧 Verificando backend API..."
    execute_remote_command "Estado del backend" \
        "echo '=== BACKEND SERVICE STATUS ===' && systemctl status aws-challenge-backend --no-pager -l 2>/dev/null || echo 'Servicio backend no existe' && echo && echo '=== PUERTO 8080 ===' && netstat -tlnp | grep :8080 2>/dev/null || echo 'Puerto 8080 no en uso' && echo && echo '=== LOGS DEL BACKEND (últimas 20 líneas) ===' && journalctl -u aws-challenge-backend --no-pager -n 20 2>/dev/null || echo 'No hay logs del backend'" \
        10
    
    # Verificar dependencias instaladas
    log_section "DEPENDENCIAS Y VERSIONES"
    execute_remote_command "Verificar Node.js y npm" \
        "echo '=== NODE.JS ===' && node --version 2>/dev/null || echo 'Node.js no instalado' && echo '=== NPM ===' && npm --version 2>/dev/null || echo 'npm no instalado' && echo '=== NGINX ===' && nginx -v 2>&1 || echo 'nginx no instalado'" \
        5
    
    # Verificar variables de entorno del backend
    log_info "🔧 Verificando configuración del backend..."
    execute_remote_command "Variables de entorno del backend" \
        "echo '=== VARIABLES DE ENTORNO DEL SERVICIO ===' && systemctl show aws-challenge-backend --property=Environment 2>/dev/null || echo 'No se puede obtener configuración del servicio'" \
        5
    
    # Verificar configuración de nginx
    log_info "🔧 Verificando configuración de nginx..."
    execute_remote_command "Configuración de nginx" \
        "echo '=== NGINX MAIN CONFIG ===' && head -20 /etc/nginx/nginx.conf 2>/dev/null || echo 'Config de nginx no accesible' && echo && echo '=== ARCHIVOS DE CONFIG ACTIVOS ===' && ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo 'sites-enabled no existe' && echo && echo '=== LOGS DE NGINX ===' && echo 'Access log:' && tail -5 /var/log/nginx/access.log 2>/dev/null || echo 'No access log' && echo 'Error log:' && tail -5 /var/log/nginx/error.log 2>/dev/null || echo 'No error log'" \
        8
    
else
    log_warning "SSM Agent no disponible. Status: $SSM_STATUS"
    log_info "Para conectar manualmente, usa:"
    echo "  aws ssm start-session --target $INSTANCE_ID --region $REGION"
    echo "  (Requiere Session Manager plugin instalado)"
    echo
    log_info "Opciones alternativas:"
    echo "  1. SSH directo si tienes key pair: ssh -i your-key.pem ubuntu@$PUBLIC_IP"
    echo "  2. EC2 Instance Connect si está habilitado en la subnet"
    echo "  3. Revisar CloudWatch logs si están configurados"
fi

# Tests de conectividad HTTP
log_section "TESTS DE CONECTIVIDAD HTTP"

if [ "$PUBLIC_IP" != "N/A" ]; then
    log_info "Probando conectividad HTTP a los endpoints esperados..."
    
    # Test del frontend principal
    log_debug "Testing frontend principal..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 20 "http://$PUBLIC_IP" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        log_success "✅ Frontend principal responde (HTTP $HTTP_STATUS)"
        # Verificar que sea HTML de React
        CONTENT_TYPE=$(curl -s -I --connect-timeout 10 "http://$PUBLIC_IP" 2>/dev/null | grep -i "content-type" | head -1)
        echo "   Content-Type: $CONTENT_TYPE"
    else
        log_error "❌ Frontend principal no responde (HTTP $HTTP_STATUS)"
    fi
    
    # Test de la página de status
    log_debug "Testing página de status..."
    STATUS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://$PUBLIC_IP/status.html" 2>/dev/null || echo "000")
    if [ "$STATUS_HTTP" = "200" ]; then
        log_success "✅ Página de status accesible (HTTP $STATUS_HTTP)"
    else
        log_warning "⚠️ Página de status no accesible (HTTP $STATUS_HTTP)"
    fi
    
    # Test del backend API
    log_debug "Testing backend API..."
    API_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://$PUBLIC_IP/api" 2>/dev/null || echo "000")
    if [ "$API_HTTP" = "200" ] || [ "$API_HTTP" = "404" ]; then
        log_success "✅ Backend API responde (HTTP $API_HTTP)"
    else
        log_error "❌ Backend API no responde (HTTP $API_HTTP)"
    fi
    
    # Test del explorador de repositorio
    log_debug "Testing explorador de repositorio..."
    REPO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "http://$PUBLIC_IP/repo" 2>/dev/null || echo "000")
    if [ "$REPO_HTTP" = "200" ]; then
        log_success "✅ Explorador de repositorio accesible (HTTP $REPO_HTTP)"
    else
        log_warning "⚠️ Explorador de repositorio no accesible (HTTP $REPO_HTTP)"
    fi
    
    # Test de tiempo de respuesta
    log_debug "Midiendo tiempo de respuesta..."
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --connect-timeout 10 "http://$PUBLIC_IP" 2>/dev/null || echo "timeout")
    if [ "$RESPONSE_TIME" != "timeout" ]; then
        echo "⏱️ Tiempo de respuesta: ${RESPONSE_TIME}s"
    fi
    
else
    log_error "No se puede realizar tests HTTP sin IP pública"
fi

# Resumen y diagnóstico final
log_section "RESUMEN Y DIAGNÓSTICO"

# Crear archivo de resumen en el directorio temporal
SUMMARY_FILE="$TEMP_DIR/diagnostic-summary.txt"
cat > "$SUMMARY_FILE" << EOF
=== RESUMEN DEL DIAGNÓSTICO ===
Fecha: $(date)
Stack: $STACK_NAME
Región: $REGION
Instance ID: $INSTANCE_ID

Información de la instancia:
- Estado: $INSTANCE_STATE
- Tipo: $INSTANCE_TYPE
- IP Pública: $PUBLIC_IP
- IP Privada: $PRIVATE_IP
- Zona: $AZ
- SSM Status: $SSM_STATUS

URLs de la aplicación:
- Principal: http://$PUBLIC_IP
- API: http://$PUBLIC_IP/api
- Status: http://$PUBLIC_IP/status.html
- Repo: http://$PUBLIC_IP/repo

Tests HTTP:
- Frontend: HTTP $HTTP_STATUS
- Status page: HTTP $STATUS_HTTP
- API: HTTP $API_HTTP
- Repo explorer: HTTP $REPO_HTTP

EOF

echo "📋 Resumen del diagnóstico:"
cat "$SUMMARY_FILE"

# Diagnóstico inteligente basado en los resultados
echo
log_info "🔍 Análisis y recomendaciones:"

if [ "$INSTANCE_STATE" != "running" ]; then
    log_error "La instancia no está ejecutándose"
    echo "   → Verificar el estado de la instancia en la consola EC2"
fi

if [ "$SSM_STATUS" != "Online" ]; then
    log_warning "SSM Agent no disponible"
    echo "   → Usar SSH directo o verificar permisos IAM del rol de la instancia"
fi

if [ "$HTTP_STATUS" = "000" ]; then
    log_error "El servidor web no responde"
    echo "   → Posibles causas:"
    echo "     • nginx no está ejecutándose"
    echo "     • Grupo de seguridad bloquea puerto 80"
    echo "     • Setup script falló"
elif [ "$HTTP_STATUS" != "200" ]; then
    log_warning "El servidor web responde pero con errores"
    echo "   → HTTP $HTTP_STATUS puede indicar configuración incorrecta"
fi

if [ "$API_HTTP" = "000" ] || [ "$API_HTTP" = "502" ] || [ "$API_HTTP" = "503" ]; then
    log_error "Backend API no funciona correctamente"
    echo "   → Verificar servicio aws-challenge-backend"
    echo "   → Revisar logs: journalctl -u aws-challenge-backend -f"
fi

# Comandos útiles para debugging manual
echo
log_info "🛠️ Comandos útiles para debugging manual:"
echo
echo "📡 Conectar vía SSM:"
echo "   aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo
echo "🔐 Conectar vía SSH (si tienes key pair):"
echo "   ssh -i your-key.pem ubuntu@$PUBLIC_IP"
echo
echo "📊 Ver logs de CloudWatch (si están configurados):"
echo "   aws logs describe-log-groups --log-group-name-prefix '/aws/ec2' --region $REGION"
echo
echo "🔄 Reiniciar servicios remotamente (vía SSM):"
echo "   # Reiniciar nginx:"
echo "   aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"sudo systemctl restart nginx\"]' --region $REGION"
echo "   # Reiniciar backend:"
echo "   aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"sudo systemctl restart aws-challenge-backend\"]' --region $REGION"
echo
echo "📁 Ver archivos importantes:"
echo "   # Logs de setup:"
echo "   aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"tail -50 /var/log/setup-ec2.log\"]' --region $REGION"
echo "   # Estado de servicios:"
echo "   aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"systemctl status nginx aws-challenge-backend\"]' --region $REGION"

echo
echo "=== FIN DEL DIAGNÓSTICO AVANZADO ==="
echo "📋 Resumen guardado temporalmente en: $SUMMARY_FILE"
