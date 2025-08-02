#!/bin/bash

# Script para redesplegar la aplicación y abrir el navegador para testing
# Este script facilita el proceso de debugging

set -e

echo "🚀 Iniciando redeploy y testing..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorio del script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

echo -e "${BLUE}📁 Proyecto ubicado en: $PROJECT_ROOT${NC}"

# Ejecutar el redeploy
echo -e "${YELLOW}🔄 Ejecutando redeploy de la aplicación...${NC}"
if [ -f "$PROJECT_ROOT/infra/scripts/redeploy-app.sh" ]; then
    cd "$PROJECT_ROOT/infra/scripts"
    ./redeploy-app.sh
else
    echo -e "${RED}❌ Error: No se encontró el script redeploy-app.sh${NC}"
    exit 1
fi

# Esperar un momento para que el redeploy se complete
echo -e "${YELLOW}⏳ Esperando 10 segundos para que se complete el redeploy...${NC}"
sleep 10

# Obtener la URL de la aplicación
echo -e "${BLUE}🔍 Obteniendo URL de la aplicación...${NC}"
cd "$PROJECT_ROOT/infra"

# Obtener el stack name del parámetro
STACK_NAME=$(jq -r '.StackName' parameters/main.json)
if [ "$STACK_NAME" = "null" ] || [ -z "$STACK_NAME" ]; then
    STACK_NAME="aws-challenge-stack"
    echo -e "${YELLOW}⚠️  Usando stack name por defecto: $STACK_NAME${NC}"
fi

# Obtener la URL del Load Balancer
ALB_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$ALB_URL" ] || [ "$ALB_URL" = "None" ]; then
    echo -e "${RED}❌ No se pudo obtener la URL del Load Balancer${NC}"
    echo -e "${YELLOW}💡 Verifica que el stack de CloudFormation esté desplegado correctamente${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Redeploy completado exitosamente${NC}"
echo -e "${GREEN}🌐 URL de la aplicación: $ALB_URL${NC}"

# Abrir el navegador (funciona en macOS)
if command -v open &> /dev/null; then
    echo -e "${BLUE}🌍 Abriendo navegador...${NC}"
    open "$ALB_URL"
else
    echo -e "${YELLOW}💡 Abre manualmente: $ALB_URL${NC}"
fi

echo ""
echo -e "${GREEN}🎉 ¡Listo para testing!${NC}"
echo -e "${BLUE}📋 Para debugging:${NC}"
echo -e "   • Frontend: Abre DevTools (F12) y revisa la consola"
echo -e "   • Backend: Revisa logs con: ${YELLOW}./infra/scripts/diagnose-remote.sh${NC}"
echo -e "   • URL directa: ${YELLOW}$ALB_URL${NC}"
