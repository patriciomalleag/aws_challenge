#!/bin/bash

# Script para verificar y descargar logs desde S3
# Uso: ./check-logs.sh [instance-id]

set -e

# Configuración
BUCKET_NAME="data-pipeline-logs-899325643341"
REGION="us-east-1"
LOG_DIR="./logs"

# Función para mostrar ayuda
show_help() {
    echo "Uso: $0 [opciones]"
    echo ""
    echo "Opciones:"
    echo "  -i, --instance-id INSTANCE_ID  ID de la instancia específica"
    echo "  -a, --all                      Mostrar todas las instancias"
    echo "  -d, --download                 Descargar logs"
    echo "  -h, --help                     Mostrar esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0 -a                          # Listar todas las instancias con logs"
    echo "  $0 -i i-1234567890abcdef0      # Ver logs de una instancia específica"
    echo "  $0 -i i-1234567890abcdef0 -d   # Descargar logs de una instancia"
    echo "  $0 -a -d                       # Descargar logs de todas las instancias"
}

# Función para listar instancias con logs
list_instances() {
    echo "📋 Instancias con logs disponibles:"
    echo "=================================="
    
    # Listar directorios de instancias en userdata-logs
    aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/" --region "${REGION}" 2>/dev/null | \
    while read -r line; do
        if [[ $line =~ PRE[[:space:]]*([^/]+)/ ]]; then
            instance_id="${BASH_REMATCH[1]}"
            echo "🖥️  Instance ID: ${instance_id}"
            
            # Contar archivos de logs para esta instancia
            log_count=$(aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" --region "${REGION}" 2>/dev/null | wc -l)
            echo "   📄 Logs disponibles: ${log_count}"
            
            # Mostrar el log más reciente
            latest_log=$(aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" --region "${REGION}" 2>/dev/null | sort | tail -1 | awk '{print $4}')
            if [[ -n "$latest_log" ]]; then
                echo "   🕒 Último log: ${latest_log}"
            fi
            echo ""
        fi
    done
}

# Función para mostrar logs de una instancia específica
show_instance_logs() {
    local instance_id="$1"
    
    echo "🔍 Logs para instancia: ${instance_id}"
    echo "=================================="
    
    # Verificar si la instancia tiene logs
    if ! aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" --region "${REGION}" >/dev/null 2>&1; then
        echo "❌ No se encontraron logs para la instancia ${instance_id}"
        return 1
    fi
    
    # Listar todos los logs de la instancia
    echo "📄 Archivos de log disponibles:"
    aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" --region "${REGION}" | \
    while read -r line; do
        if [[ $line =~ ^[[:space:]]*[0-9]+[[:space:]]+[0-9-]+[[:space:]]+[0-9:]+[[:space:]]+(.+)$ ]]; then
            filename="${BASH_REMATCH[1]}"
            echo "   📋 ${filename}"
        fi
    done
    
    # Mostrar logs de PM2 si existen
    echo ""
    echo "🚀 Logs de PM2:"
    if aws s3 ls "s3://${BUCKET_NAME}/pm2-logs/${instance_id}/" --region "${REGION}" >/dev/null 2>&1; then
        aws s3 ls "s3://${BUCKET_NAME}/pm2-logs/${instance_id}/" --region "${REGION}" | \
        while read -r line; do
            if [[ $line =~ ^[[:space:]]*[0-9]+[[:space:]]+[0-9-]+[[:space:]]+[0-9:]+[[:space:]]+(.+)$ ]]; then
                filename="${BASH_REMATCH[1]}"
                echo "   📋 ${filename}"
            fi
        done
    else
        echo "   ❌ No hay logs de PM2 disponibles"
    fi
    
    # Mostrar logs de Nginx si existen
    echo ""
    echo "🌐 Logs de Nginx:"
    if aws s3 ls "s3://${BUCKET_NAME}/nginx-logs/${instance_id}/" --region "${REGION}" >/dev/null 2>&1; then
        aws s3 ls "s3://${BUCKET_NAME}/nginx-logs/${instance_id}/" --region "${REGION}" | \
        while read -r line; do
            if [[ $line =~ ^[[:space:]]*[0-9]+[[:space:]]+[0-9-]+[[:space:]]+[0-9:]+[[:space:]]+(.+)$ ]]; then
                filename="${BASH_REMATCH[1]}"
                echo "   📋 ${filename}"
            fi
        done
    else
        echo "   ❌ No hay logs de Nginx disponibles"
    fi
}

# Función para descargar logs
download_logs() {
    local instance_id="$1"
    local download_all="$2"
    
    if [[ "$download_all" == "true" ]]; then
        echo "📥 Descargando logs de todas las instancias..."
        mkdir -p "${LOG_DIR}"
        
        # Descargar logs de todas las instancias
        aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/" --region "${REGION}" 2>/dev/null | \
        while read -r line; do
            if [[ $line =~ PRE[[:space:]]*([^/]+)/ ]]; then
                local inst_id="${BASH_REMATCH[1]}"
                echo "📥 Descargando logs de instancia: ${inst_id}"
                aws s3 sync "s3://${BUCKET_NAME}/userdata-logs/${inst_id}/" "${LOG_DIR}/${inst_id}/userdata-logs/" --region "${REGION}"
                aws s3 sync "s3://${BUCKET_NAME}/pm2-logs/${inst_id}/" "${LOG_DIR}/${inst_id}/pm2-logs/" --region "${REGION}" 2>/dev/null || true
                aws s3 sync "s3://${BUCKET_NAME}/nginx-logs/${inst_id}/" "${LOG_DIR}/${inst_id}/nginx-logs/" --region "${REGION}" 2>/dev/null || true
            fi
        done
    else
        echo "📥 Descargando logs de instancia: ${instance_id}"
        mkdir -p "${LOG_DIR}/${instance_id}"
        
        # Descargar logs de la instancia específica
        aws s3 sync "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" "${LOG_DIR}/${instance_id}/userdata-logs/" --region "${REGION}"
        aws s3 sync "s3://${BUCKET_NAME}/pm2-logs/${instance_id}/" "${LOG_DIR}/${instance_id}/pm2-logs/" --region "${REGION}" 2>/dev/null || true
        aws s3 sync "s3://${BUCKET_NAME}/nginx-logs/${instance_id}/" "${LOG_DIR}/${instance_id}/nginx-logs/" --region "${REGION}" 2>/dev/null || true
        
        echo "✅ Logs descargados en: ${LOG_DIR}/${instance_id}/"
    fi
}

# Función para mostrar el contenido del log más reciente
show_latest_log() {
    local instance_id="$1"
    
    echo "📖 Mostrando el log más reciente para instancia: ${instance_id}"
    echo "=================================================="
    
    # Obtener el log más reciente
    latest_log=$(aws s3 ls "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/" --region "${REGION}" 2>/dev/null | sort | tail -1 | awk '{print $4}')
    
    if [[ -n "$latest_log" ]]; then
        echo "📄 Archivo: ${latest_log}"
        echo "----------------------------------------"
        aws s3 cp "s3://${BUCKET_NAME}/userdata-logs/${instance_id}/${latest_log}" - --region "${REGION}" 2>/dev/null
    else
        echo "❌ No se encontraron logs para la instancia ${instance_id}"
    fi
}

# Variables para opciones
INSTANCE_ID=""
SHOW_ALL=false
DOWNLOAD=false
SHOW_LATEST=false

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--instance-id)
            INSTANCE_ID="$2"
            shift 2
            ;;
        -a|--all)
            SHOW_ALL=true
            shift
            ;;
        -d|--download)
            DOWNLOAD=true
            shift
            ;;
        -l|--latest)
            SHOW_LATEST=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "❌ Opción desconocida: $1"
            show_help
            exit 1
            ;;
    esac
done

# Verificar que AWS CLI esté instalado
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI no está instalado. Por favor instálalo primero."
    exit 1
fi

# Verificar que el bucket existe
if ! aws s3 ls "s3://${BUCKET_NAME}" --region "${REGION}" >/dev/null 2>&1; then
    echo "❌ El bucket ${BUCKET_NAME} no existe o no tienes permisos para acceder a él."
    exit 1
fi

# Ejecutar acciones según las opciones
if [[ "$SHOW_ALL" == "true" ]]; then
    list_instances
    if [[ "$DOWNLOAD" == "true" ]]; then
        download_logs "" "true"
    fi
elif [[ -n "$INSTANCE_ID" ]]; then
    show_instance_logs "$INSTANCE_ID"
    if [[ "$SHOW_LATEST" == "true" ]]; then
        echo ""
        show_latest_log "$INSTANCE_ID"
    fi
    if [[ "$DOWNLOAD" == "true" ]]; then
        echo ""
        download_logs "$INSTANCE_ID" "false"
    fi
else
    echo "❌ Debes especificar una instancia (-i) o usar --all (-a)"
    show_help
    exit 1
fi

echo ""
echo "✅ Operación completada" 