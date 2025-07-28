#!/bin/bash

# Script para diagnosticar problemas con la instancia EC2
# Verifica estado, logs, servicios y conectividad

set -e

echo "🔍 Diagnóstico de la instancia EC2..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Obtener información de la instancia
echo -e "\n${BLUE}=== INFORMACIÓN DE LA INSTANCIA ===${NC}"

# Obtener ID de la instancia desde CloudFormation
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name data-pipeline-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebAppInstanceId`].OutputValue' \
  --output text 2>/dev/null || echo "ERROR: No se pudo obtener el ID de la instancia")

echo "Instance ID: $INSTANCE_ID"

if [ "$INSTANCE_ID" = "ERROR: No se pudo obtener el ID de la instancia" ]; then
    echo -e "${RED}❌ No se pudo obtener el ID de la instancia${NC}"
    echo "Verificando stacks disponibles..."
    aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?contains(StackName, `data-pipeline`)].StackName' --output table
    exit 1
fi

# Verificar estado de la instancia
echo -e "\n${BLUE}=== ESTADO DE LA INSTANCIA ===${NC}"
aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].{State:State.Name,PublicIP:PublicIpAddress,PrivateIP:PrivateIpAddress,LaunchTime:LaunchTime}' \
  --output table

# Verificar Security Groups
echo -e "\n${BLUE}=== SECURITY GROUPS ===${NC}"
aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].SecurityGroups[*].{GroupId:GroupId,GroupName:GroupName}' \
  --output table

# Verificar reglas del Security Group
SG_ID=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

echo -e "\n${BLUE}=== REGLAS DEL SECURITY GROUP ===${NC}"
aws ec2 describe-security-groups \
  --group-ids $SG_ID \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`80` || FromPort==`22`].{Port:FromPort,Protocol:IpProtocol,CIDR:IpRanges[0].CidrIp}' \
  --output table

# Verificar logs en S3
echo -e "\n${BLUE}=== LOGS EN S3 ===${NC}"
LOG_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name data-pipeline-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketLogsName`].OutputValue' \
  --output text 2>/dev/null || echo "ERROR: No se pudo obtener el bucket de logs")

echo "Log Bucket: $LOG_BUCKET"

if [ "$LOG_BUCKET" != "ERROR: No se pudo obtener el bucket de logs" ]; then
    echo "Buscando logs en S3..."
    aws s3 ls s3://$LOG_BUCKET/userdata-logs/ --recursive --human-readable --summarize 2>/dev/null || echo "No se encontraron logs en S3"
else
    echo -e "${RED}❌ No se pudo obtener el bucket de logs${NC}"
fi

# Verificar conectividad
echo -e "\n${BLUE}=== VERIFICACIÓN DE CONECTIVIDAD ===${NC}"
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

if [ "$PUBLIC_IP" != "None" ] && [ -n "$PUBLIC_IP" ]; then
    echo "IP Pública: $PUBLIC_IP"
    
    # Verificar puerto 80
    echo -n "Puerto 80 (HTTP): "
    if timeout 5 bash -c "</dev/tcp/$PUBLIC_IP/80" 2>/dev/null; then
        echo -e "${GREEN}✅ ABIERTO${NC}"
    else
        echo -e "${RED}❌ CERRADO${NC}"
    fi
    
    # Verificar puerto 22
    echo -n "Puerto 22 (SSH): "
    if timeout 5 bash -c "</dev/tcp/$PUBLIC_IP/22" 2>/dev/null; then
        echo -e "${GREEN}✅ ABIERTO${NC}"
    else
        echo -e "${RED}❌ CERRADO${NC}"
    fi
    
    # Verificar puerto 8080
    echo -n "Puerto 8080 (Backend): "
    if timeout 5 bash -c "</dev/tcp/$PUBLIC_IP/8080" 2>/dev/null; then
        echo -e "${GREEN}✅ ABIERTO${NC}"
    else
        echo -e "${RED}❌ CERRADO${NC}"
    fi
else
    echo -e "${RED}❌ No se pudo obtener la IP pública${NC}"
fi

# Verificar CloudWatch Logs
echo -e "\n${BLUE}=== CLOUDWATCH LOGS ===${NC}"
echo "Buscando logs de la instancia en CloudWatch..."

# Verificar si hay logs de sistema
aws logs describe-log-groups --log-group-name-prefix "/aws/ec2" --query 'logGroups[?contains(logGroupName, `'$INSTANCE_ID'`)].logGroupName' --output table 2>/dev/null || echo "No se encontraron logs de sistema"

# Verificar logs de userdata
aws logs describe-log-groups --log-group-name-prefix "/aws/ec2/userdata" --query 'logGroups[?contains(logGroupName, `'$INSTANCE_ID'`)].logGroupName' --output table 2>/dev/null || echo "No se encontraron logs de userdata"

echo -e "\n${YELLOW}=== POSIBLES CAUSAS DEL PROBLEMA ===${NC}"
echo "1. UserData no se ejecutó correctamente"
echo "2. Nginx no se inició"
echo "3. Backend no se inició"
echo "4. Problemas de permisos IAM"
echo "5. Problemas de red/VPC"

echo -e "\n${YELLOW}=== PRÓXIMOS PASOS ===${NC}"
echo "1. Verificar logs de userdata en la instancia"
echo "2. Conectarse por SSH para diagnosticar"
echo "3. Verificar que los servicios estén corriendo"
echo "4. Revisar configuración de nginx"

echo -e "\n${BLUE}=== COMANDOS ÚTILES ===${NC}"
echo "# Conectarse por SSH (si tienes key pair):"
echo "ssh -i tu-key.pem ec2-user@$PUBLIC_IP"
echo ""
echo "# Verificar logs de userdata:"
echo "aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"sudo cat /var/log/userdata.log\"]'"
echo ""
echo "# Verificar servicios:"
echo "aws ssm send-command --instance-ids $INSTANCE_ID --document-name 'AWS-RunShellScript' --parameters 'commands=[\"sudo systemctl status nginx\",\"sudo pm2 status\"]'" 