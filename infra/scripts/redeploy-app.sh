#!/bin/bash
# Script para redesplegar la aplicación en una instancia EC2 existente
# Este script actualiza el código del repositorio y reconstruye la aplicación sin modificar la infraestructura

set -e  # Salir si cualquier comando falla

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

# Variables
REPO_URL="https://github.com/patriciomalleag/aws_challenge.git"
DEFAULT_STACK_NAME="data-pipeline-stack"
DEFAULT_REGION="us-east-1"
DEFAULT_PROFILE="default"
REMOTE_REPO_DIR="/opt/webapp"
REMOTE_TEMP_DIR="/tmp/webapp-redeploy-$$"

# Función para mostrar ayuda
show_help() {
  echo "Uso: $0 [opciones]"
  echo ""
  echo "Opciones:"
  echo "  -i, --instance-id ID    ID de la instancia EC2 (obligatorio)"
  echo "  -r, --region REGION     Región AWS (default: $DEFAULT_REGION)"
  echo "  -s, --stack STACK_NAME  Nombre del stack de CloudFormation (default: $DEFAULT_STACK_NAME)"
  echo "  -b, --branch BRANCH     Rama del repositorio a desplegar (default: main)"
  echo "  -p, --profile PROFILE   Perfil AWS a usar (default: $DEFAULT_PROFILE)"
  echo "  -h, --help              Mostrar esta ayuda"
  echo ""
  echo "Ejemplos:"
  echo "  $0 --instance-id i-01234567890abcdef --region us-east-1"
  echo "  $0 --instance-id i-01234567890abcdef --profile my-aws-profile"
  exit 1
}

# Parámetros por defecto
INSTANCE_ID=""
REGION="$DEFAULT_REGION"
STACK_NAME="$DEFAULT_STACK_NAME"
BRANCH="main"
AWS_PROFILE="$DEFAULT_PROFILE"

# Parsear argumentos
while [[ $# -gt 0 ]]; do
  case $1 in
    -i|--instance-id)
      INSTANCE_ID="$2"
      shift 2
      ;;
    -r|--region)
      REGION="$2"
      shift 2
      ;;
    -s|--stack)
      STACK_NAME="$2"
      shift 2
      ;;
    -b|--branch)
      BRANCH="$2"
      shift 2
      ;;
    -p|--profile)
      AWS_PROFILE="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      ;;
    *)
      log_error "Opción desconocida: $1"
      show_help
      ;;
  esac
done

# Validar parámetros
if [ -z "$INSTANCE_ID" ]; then
  log_error "Se requiere el ID de la instancia con --instance-id"
  exit 1
fi

# Verificar que el AWS CLI está instalado
if ! command -v aws &> /dev/null; then
  log_error "AWS CLI no está instalado. Instálalo primero: https://aws.amazon.com/cli/"
  exit 1
fi

# Verificar que el plugin de Session Manager está instalado
if ! aws --version 2>&1 | grep -q "session-manager-plugin"; then
  log_warning "El plugin de Session Manager puede no estar instalado."
  log_warning "Si tienes problemas, instálalo: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
fi

# Verificar que existe el perfil AWS
if ! aws configure list --profile "$AWS_PROFILE" &> /dev/null; then
  log_warning "El perfil AWS '$AWS_PROFILE' no existe o no está configurado correctamente."
  log_warning "Usando credenciales por defecto..."
fi

log_info "Iniciando redespliegue de la aplicación..."

# Función para ejecutar comandos en la instancia EC2
execute_remote() {
  local cmd="$1"
  local explanation="$2"
  
  if [ -z "$explanation" ]; then
    log_info "Ejecutando comando remoto..."
  else
    log_info "$explanation"
  fi
  
  # Usar SSM para ejecutar el comando con el perfil configurado
  aws ssm start-session \
    --target "$INSTANCE_ID" \
    --region "$REGION" \
    --profile "$AWS_PROFILE" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=[\"$cmd\"]"
  
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log_error "El comando remoto falló con código de salida $exit_code"
    return $exit_code
  fi
  return 0
}

# Verificar conexión con la instancia
log_info "Verificando conexión con la instancia..."

if ! aws ssm describe-instance-information \
     --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
     --region "$REGION" \
     --profile "$AWS_PROFILE" \
     --query "InstanceInformationList[*].PingStatus" \
     --output text | grep -q "Online"; then
  log_error "La instancia no está disponible a través de SSM. Verifica que el SSM Agent esté instalado y en ejecución."
  exit 1
fi
log_success "Conexión SSM verificada correctamente"

# Obtener información de la instancia y el despliegue actual
log_info "Obteniendo información del despliegue actual..."

# Verificar que la aplicación está instalada en la instancia
if ! aws ssm send-command \
     --instance-ids "$INSTANCE_ID" \
     --region "$REGION" \
     --profile "$AWS_PROFILE" \
     --document-name "AWS-RunShellScript" \
     --parameters "commands=[\"test -d $REMOTE_REPO_DIR && echo 'Exists' || echo 'Not Found'\"]" \
     --query "Command.CommandId" \
     --output text | xargs -I {} aws ssm wait command-executed \
     --command-id {} \
     --instance-id "$INSTANCE_ID" \
     --region "$REGION" \
     --profile "$AWS_PROFILE" &> /dev/null; then
  log_error "No se pudo verificar la estructura del repositorio."
  exit 1
fi

# Crear directorio temporal en la instancia remota
log_info "Preparando directorio temporal en instancia remota..."
execute_remote "mkdir -p $REMOTE_TEMP_DIR" "Creando directorio temporal..."

# Clonar el repositorio en el directorio temporal
log_info "Clonando la última versión del repositorio en instancia remota..."
execute_remote "git clone -b $BRANCH $REPO_URL $REMOTE_TEMP_DIR/aws_challenge" "Clonando repositorio desde GitHub..."

# Detener servicios
log_info "Deteniendo servicios actuales..."
execute_remote "sudo systemctl stop aws-challenge-backend nginx" "Deteniendo servicios backend y nginx..."

# Actualizar el backend
log_info "Actualizando backend..."
execute_remote "cd $REMOTE_TEMP_DIR/aws_challenge/backend-api && npm install" "Instalando dependencias del backend..."

# Construir el frontend
log_info "Construyendo frontend..."
execute_remote "cd $REMOTE_TEMP_DIR/aws_challenge/frontend && npm install && npm run build" "Construyendo frontend React..."

# Copiar archivos actualizados
log_info "Copiando archivos actualizados..."
execute_remote "sudo rm -rf $REMOTE_REPO_DIR/* && sudo cp -r $REMOTE_TEMP_DIR/aws_challenge/* $REMOTE_REPO_DIR/" "Actualizando archivos del repositorio..."
execute_remote "sudo cp -r $REMOTE_TEMP_DIR/aws_challenge/frontend/build/* /var/www/html/" "Actualizando archivos del frontend..."

# Corregir permisos si es necesario
log_info "Corrigiendo permisos..."
execute_remote "sudo chown -R ubuntu:ubuntu $REMOTE_REPO_DIR" "Ajustando permisos del repositorio..."

# Reiniciar servicios
log_info "Reiniciando servicios..."
execute_remote "sudo systemctl start aws-challenge-backend nginx" "Iniciando servicios backend y nginx..."

# Verificar estado de los servicios
log_info "Verificando estado de servicios..."
execute_remote "sudo systemctl status aws-challenge-backend nginx --no-pager -l" "Estado de los servicios:"

# Limpiar directorio temporal
log_info "Limpiando archivos temporales..."
execute_remote "rm -rf $REMOTE_TEMP_DIR" "Eliminando directorio temporal..."

# Verificar si la aplicación está disponible
log_info "Verificando disponibilidad de la aplicación..."

# Obtener IP pública de la instancia
EC2_PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --profile "$AWS_PROFILE" \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text)

if [ "$EC2_PUBLIC_IP" = "None" ] || [ -z "$EC2_PUBLIC_IP" ]; then
  log_warning "No se pudo determinar la IP pública de la instancia."
else
  # Verificar que los endpoints principales están respondiendo
  log_info "Probando conexión a endpoints principales..."
  
  # Probar el frontend
  if curl -s -o /dev/null -w "%{http_code}" "http://$EC2_PUBLIC_IP" | grep -q "200"; then
    log_success "Frontend responde correctamente (HTTP 200)"
  else
    log_warning "Frontend no responde con HTTP 200"
  fi
  
  # Probar la API
  if curl -s -o /dev/null -w "%{http_code}" "http://$EC2_PUBLIC_IP/api/health" | grep -q "200"; then
    log_success "API Backend responde correctamente (HTTP 200)"
  else
    log_warning "API Backend no responde con HTTP 200"
  fi
  
  log_success "==========================================="
  log_success "🚀 Redespliegue completado exitosamente 🚀"
  log_success "==========================================="
  log_info "URLs de la aplicación:"
  log_info "• Frontend: http://$EC2_PUBLIC_IP"
  log_info "• Backend API: http://$EC2_PUBLIC_IP/api"
  log_info "• Estado del sistema: http://$EC2_PUBLIC_IP/status.html"
fi

exit 0
