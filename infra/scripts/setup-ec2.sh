#!/bin/bash
# Setup script para EC2 - AWS Challenge (Ubuntu Server 22.04 LTS)
# Este script configura nginx y la aplicación web después del clonado del repositorio

set -e  # Salir si cualquier comando falla

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "❌ ERROR: Este script debe ejecutarse como root (sudo)"
    echo "Uso: sudo $0"
    exit 1
fi

# Variables
REPO_DIR="/opt/webapp"
WEB_DIR="/var/www/html"
LOG_FILE="/var/log/setup-ec2.log"

# Función para loggear con timestamp
log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" | tee -a "$LOG_FILE"
}

# Función para verificar si un comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Función para verificar permisos de root
check_root_permissions() {
    local test_file="/tmp/root_test_$$"
    
    # Probar escribir en /etc
    if ! touch /etc/test_permissions_$$ 2>/dev/null; then
        log_message "❌ ERROR: No se pueden crear archivos en /etc"
        return 1
    fi
    rm -f /etc/test_permissions_$$ 2>/dev/null
    
    # Probar systemctl
    if ! systemctl --version >/dev/null 2>&1; then
        log_message "❌ ERROR: systemctl no está disponible"
        return 1
    fi
    
    # Probar apt (Ubuntu usa APT como gestor de paquetes)
    if ! apt --version >/dev/null 2>&1; then
        log_message "❌ ERROR: apt no está disponible"
        return 1
    fi
    
    log_message "✅ Permisos de root verificados correctamente"
    return 0
}

# Inicio del script
log_message "=== SETUP EC2 SCRIPT START ==="
log_message "Usuario actual: $(whoami)"
log_message "UID: $EUID"
log_message "Directorio del repositorio: $REPO_DIR"
log_message "Directorio web: $WEB_DIR"

# Verificar permisos de root
if ! check_root_permissions; then
    log_message "❌ ERROR: Verificación de permisos de root falló"
    exit 1
fi

# Verificar que estamos en el directorio correcto
if [ ! -f "$REPO_DIR/README.md" ]; then
    log_message "❌ ERROR: No se encuentra el repositorio en $REPO_DIR"
    exit 1
fi

log_message "✅ Repositorio encontrado correctamente"

# Instalar dependencias si no están instaladas
log_message "Verificando e instalando dependencias..."

# Actualizar repositorios
log_message "Actualizando repositorios de paquetes..."
if apt update >> "$LOG_FILE" 2>&1; then
    log_message "✅ Repositorios actualizados correctamente"
else
    log_message "❌ Error al actualizar repositorios"
    exit 1
fi

# Instalar nginx si no está instalado
if ! command_exists nginx; then
    log_message "Instalando nginx en Ubuntu..."
    if apt install -y nginx >> "$LOG_FILE" 2>&1; then
        log_message "✅ nginx instalado correctamente"
    else
        log_message "❌ Error al instalar nginx"
        exit 1
    fi
else
    log_message "✅ nginx ya está instalado"
fi

# Instalar Node.js si no está instalado
if ! command_exists node; then
    log_message "Instalando Node.js en Ubuntu..."
    if apt install -y nodejs npm >> "$LOG_FILE" 2>&1; then
        log_message "✅ Node.js instalado correctamente"
    else
        log_message "❌ Error al instalar Node.js"
        exit 1
    fi
else
    log_message "✅ Node.js ya está instalado"
fi
# Verificar versiones instaladas
log_message "Verificando versiones instaladas:"
log_message "Node.js: $(node --version 2>/dev/null || echo 'No instalado')"
log_message "NPM: $(npm --version 2>/dev/null || echo 'No instalado')"

# Construir el frontend React
log_message "Construyendo frontend React..."
cd "$REPO_DIR/frontend"

if [ ! -f "package.json" ]; then
    log_message "❌ ERROR: No se encuentra package.json en frontend"
    exit 1
fi

log_message "Instalando dependencias del frontend..."
if npm install >> "$LOG_FILE" 2>&1; then
    log_message "✅ Dependencias del frontend instaladas"
else
    log_message "❌ Error al instalar dependencias del frontend"
    exit 1
fi

log_message "Construyendo aplicación React para producción..."
if npm run build >> "$LOG_FILE" 2>&1; then
    log_message "✅ Frontend construido correctamente"
else
    log_message "❌ Error al construir frontend"
    exit 1
fi

# Copiar archivos construidos al directorio web
log_message "Copiando archivos del frontend a nginx..."
if cp -r build/* "$WEB_DIR/" >> "$LOG_FILE" 2>&1; then
    log_message "✅ Archivos del frontend copiados a $WEB_DIR"
else
    log_message "❌ Error al copiar archivos del frontend"
    exit 1
fi

# Configurar el backend API
log_message "Configurando backend API..."
cd "$REPO_DIR/backend-api"

if [ ! -f "package.json" ]; then
    log_message "❌ ERROR: No se encuentra package.json en backend-api"
    exit 1
fi

log_message "Instalando dependencias del backend..."
if npm install >> "$LOG_FILE" 2>&1; then
    log_message "✅ Dependencias del backend instaladas"
else
    log_message "❌ Error al instalar dependencias del backend"
    exit 1
fi

# Crear servicio systemd para el backend
log_message "Creando servicio systemd para el backend..."

# Obtener variables de entorno (pasadas desde CloudFormation UserData)
CF_AWS_REGION="${AWS_REGION:-us-east-1}"
CF_S3_BUCKET_RAW="${S3_BUCKET_RAW:-data-pipeline-raw-unknown}"
CF_S3_BUCKET_LOGS="${S3_BUCKET_LOGS:-data-pipeline-logs-unknown}"
CF_DDB_TABLE_NAME="${DDB_TABLE_NAME:-datasets-catalog}"
CF_LAMBDA_QUERY_FUNCTION_NAME="${LAMBDA_QUERY_FUNCTION_NAME:-data-pipeline-query-function}"
CF_LAMBDA_ETL_FUNCTION_NAME="${LAMBDA_ETL_FUNCTION_NAME:-data-pipeline-etl-function}"

log_message "Configurando backend con variables de CloudFormation:"
log_message "  AWS_REGION: $CF_AWS_REGION"
log_message "  S3_BUCKET_RAW: $CF_S3_BUCKET_RAW"
log_message "  DDB_TABLE_NAME: $CF_DDB_TABLE_NAME"
log_message "  LAMBDA_QUERY_FUNCTION_NAME: $CF_LAMBDA_QUERY_FUNCTION_NAME"
log_message "  LAMBDA_ETL_FUNCTION_NAME: $CF_LAMBDA_ETL_FUNCTION_NAME"

cat > /etc/systemd/system/aws-challenge-backend.service << EOF
[Unit]
Description=AWS Challenge Backend API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$REPO_DIR/backend-api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=AWS_REGION=$CF_AWS_REGION
Environment=S3_BUCKET_RAW=$CF_S3_BUCKET_RAW
Environment=S3_BUCKET_LOGS=$CF_S3_BUCKET_LOGS
Environment=DDB_TABLE_NAME=$CF_DDB_TABLE_NAME
Environment=LAMBDA_QUERY_FUNCTION_NAME=$CF_LAMBDA_QUERY_FUNCTION_NAME
Environment=LAMBDA_ETL_FUNCTION_NAME=$CF_LAMBDA_ETL_FUNCTION_NAME

[Install]
WantedBy=multi-user.target
EOF

# Habilitar e iniciar el servicio del backend
log_message "Habilitando servicio del backend..."
if systemctl enable aws-challenge-backend >> "$LOG_FILE" 2>&1; then
    log_message "✅ Servicio del backend habilitado"
else
    log_message "❌ Error al habilitar servicio del backend"
    exit 1
fi

log_message "Iniciando servicio del backend..."
if systemctl start aws-challenge-backend >> "$LOG_FILE" 2>&1; then
    log_message "✅ Servicio del backend iniciado"
else
    log_message "❌ Error al iniciar servicio del backend"
    systemctl status aws-challenge-backend --no-pager -l >> "$LOG_FILE" 2>&1
fi

# Verificar que el backend está corriendo
sleep 5
if systemctl is-active --quiet aws-challenge-backend; then
    log_message "✅ Backend API corriendo correctamente"
    log_message "Puerto 8080 en uso por: $(netstat -tlnp | grep :8080 || echo 'No detectado')"
else
    log_message "⚠️ El backend no está corriendo como esperado"
    systemctl status aws-challenge-backend --no-pager -l >> "$LOG_FILE" 2>&1
fi

# Crear página de status del sistema
log_message "Creando página de status del sistema..."
cat > "$WEB_DIR/status.html" << EOF
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Challenge - Setup Completado</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #232f3e; }
        .status { background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .logs { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        ul { padding-left: 20px; }
        a { color: #0066cc; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 AWS Challenge - Setup Completado</h1>
        <div class="status">
            <h3>✅ Estado del sistema:</h3>
            <p>El setup de EC2 se ha completado exitosamente. Los servicios están corriendo.</p>
        </div>
        <div class="info">
            <h3>📁 Estructura del proyecto:</h3>
            <ul>
                <li>📁 frontend/ - Aplicación React</li>
                <li>📁 backend-api/ - API Node.js</li>
                <li>📁 lambda-etl/ - Función Lambda ETL</li>
                <li>📁 lambda-query/ - Función Lambda Query</li>
                <li>📁 infra/ - Infraestructura CloudFormation</li>
                <li>📁 shared/ - Utilidades compartidas</li>
            </ul>
        </div>
        <div class="info status">
            <h3>🔧 Información del sistema:</h3>
            <p>
                <strong>Instance ID:</strong> $INSTANCE_ID<br>
                <strong>Región:</strong> $REGION<br>
                <strong>IP Pública:</strong> $PUBLIC_IP<br>
                <strong>Node.js:</strong> $(node --version 2>/dev/null || echo "No instalado")<br>
                <strong>NPM:</strong> $(npm --version 2>/dev/null || echo "No instalado")<br>
                <strong>Nginx:</strong> $(nginx -v 2>&1 | cut -d' ' -f3 || echo "No instalado")
            </p>
        </div>
        <div class="logs">
            <strong>📋 Enlaces útiles:</strong><br>
            <a href="/repo" target="_blank">🔗 Explorar código del repositorio</a><br>
            <a href="https://github.com/patriciomalleag/aws_challenge" target="_blank">🔗 Ver repositorio en GitHub</a>
        </div>
        <p><small>Configurado por: infra/scripts/setup-ec2.sh</small></p>
    </div>
</body>
</html>
EOF

log_message "✅ Página de status creada: $(wc -c < "$WEB_DIR/status.html") bytes"

# Configurar nginx
log_message "Configurando nginx (requiere permisos de root)..."

# Verificar que podemos escribir en /etc/nginx
if [ ! -w "/etc/nginx" ]; then
    log_message "❌ ERROR: No se pueden escribir archivos en /etc/nginx (permisos insuficientes)"
    exit 1
fi

# Backup de configuración original
if cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup 2>>"$LOG_FILE"; then
    log_message "✅ Backup de configuración creado"
else
    log_message "⚠️  No se pudo crear backup de configuración"
fi

# Limpiar configuraciones conflictivas
log_message "Limpiando configuraciones conflictivas..."
rm -f /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default

# Crear configuración de nginx para React SPA
cat > /etc/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;
    
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;
        root /var/www/html;
        index index.html;
        
        # Configuración para React SPA
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        # Proxy para API backend
        location /api {
            proxy_pass http://localhost:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
        
        # Archivos estáticos con cache
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            try_files $uri =404;
        }
        
        # Ubicación para explorar repositorio (debug)
        location /repo {
            alias /opt/webapp;
            autoindex on;
            autoindex_exact_size off;
            autoindex_localtime on;
        }
        
        error_page 404 /index.html;
        error_page 500 502 503 504 /50x.html;
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }
}
EOF

# Verificar configuración
log_message "Verificando configuración de nginx..."
if nginx -t >> "$LOG_FILE" 2>&1; then
    log_message "✅ Configuración de nginx válida"
else
    log_message "❌ Error en configuración de nginx:"
    nginx -t 2>&1 | tee -a "$LOG_FILE"
    exit 1
fi

# Iniciar nginx
log_message "Iniciando nginx (requiere permisos de root)..."

# Detener nginx si está corriendo
log_message "Deteniendo nginx previo..."
if systemctl stop nginx >> "$LOG_FILE" 2>&1; then
    log_message "✅ nginx detenido"
else
    log_message "ℹ️  nginx no estaba corriendo"
fi
sleep 2

# Habilitar e iniciar nginx
log_message "Habilitando nginx para inicio automático..."
if systemctl enable nginx >> "$LOG_FILE" 2>&1; then
    log_message "✅ nginx habilitado para inicio automático"
else
    log_message "❌ Error al habilitar nginx"
    exit 1
fi

log_message "Iniciando nginx..."
if systemctl start nginx >> "$LOG_FILE" 2>&1; then
    log_message "✅ Comando de inicio de nginx ejecutado"
else
    log_message "❌ Error al ejecutar comando de inicio de nginx"
    exit 1
fi

# Verificar estado
sleep 3
if systemctl is-active --quiet nginx; then
    log_message "✅ nginx iniciado correctamente"
    log_message "Puerto 80 en uso por: $(netstat -tlnp | grep :80)"
    
    # Test HTTP
    if curl -s http://localhost/status.html | grep -q "AWS Challenge"; then
        log_message "✅ Página de status funcionando correctamente"
    else
        log_message "⚠️ Página de status no responde como esperado"
    fi
else
    log_message "❌ Error al iniciar nginx"
    systemctl status nginx --no-pager -l >> "$LOG_FILE" 2>&1
    exit 1
fi

# Obtener información de la instancia para el archivo final
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "unknown")
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || echo "unknown")
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "unknown")

# Test final de la aplicación
log_message "Realizando test final de la aplicación..."
sleep 5

# Test del frontend
if curl -s http://localhost | grep -q "html"; then
    log_message "✅ Frontend React funcionando correctamente"
else
    log_message "⚠️ Frontend no responde como esperado"
fi

# Test del backend API
if curl -s http://localhost/api >/dev/null 2>&1; then
    log_message "✅ Backend API responde correctamente"
else
    log_message "⚠️ Backend API no responde (esto puede ser normal si no hay rutas definidas)"
fi

# Crear archivo de información
cat > "$REPO_DIR/deployment-info.txt" << EOF
AWS Challenge - Información de despliegue
========================================

Fecha: $(date)
Instance ID: $INSTANCE_ID
Región: $REGION
IP Pública: $PUBLIC_IP

Aplicación:
- Frontend React: http://$PUBLIC_IP
- Backend API: http://$PUBLIC_IP/api
- Página de status: http://$PUBLIC_IP/status.html
- Explorar código: http://$PUBLIC_IP/repo

Directorios:
- Repositorio: $REPO_DIR
- Web root: $WEB_DIR
- Frontend build: $REPO_DIR/frontend/build

Servicios:
- nginx: $(systemctl is-active nginx 2>/dev/null || echo "desconocido")
- aws-challenge-backend: $(systemctl is-active aws-challenge-backend 2>/dev/null || echo "desconocido")

Logs:
- Setup: $LOG_FILE
- Nginx access: /var/log/nginx/access.log
- Nginx error: /var/log/nginx/error.log
- Backend: journalctl -u aws-challenge-backend

Para acceso SSH:
ssh -i your-key.pem ubuntu@$PUBLIC_IP

Para ver logs del backend:
sudo journalctl -u aws-challenge-backend -f
EOF

log_message "=== SETUP COMPLETADO EXITOSAMENTE ==="
log_message "Aplicación React disponible en: http://$PUBLIC_IP"
log_message "Backend API disponible en: http://$PUBLIC_IP/api"
log_message "Página de status del sistema: http://$PUBLIC_IP/status.html"
log_message "Información guardada en: $REPO_DIR/deployment-info.txt"
