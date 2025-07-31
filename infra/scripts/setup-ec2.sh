#!/bin/bash
# Setup script para EC2 - AWS Challenge (Amazon Linux 2023)
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
    
    # Probar dnf (Amazon Linux 2023 usa DNF en lugar de YUM)
    if ! dnf --version >/dev/null 2>&1; then
        log_message "⚠️  ADVERTENCIA: dnf no está disponible, intentando con yum"
        if ! yum --version >/dev/null 2>&1; then
            log_message "❌ ERROR: Ni dnf ni yum están disponibles"
            return 1
        fi
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

# Instalar nginx si no está instalado
if ! command_exists nginx; then
    log_message "Instalando nginx en Amazon Linux 2023..."
    # En Amazon Linux 2023, nginx está en los repositorios estándar
    if dnf install -y nginx >> "$LOG_FILE" 2>&1; then
        log_message "✅ nginx instalado correctamente con dnf"
    elif yum install -y nginx >> "$LOG_FILE" 2>&1; then
        log_message "✅ nginx instalado correctamente con yum"
    else
        log_message "❌ Error al instalar nginx"
        exit 1
    fi
else
    log_message "✅ nginx ya está instalado"
fi

# Instalar Node.js si no está instalado
if ! command_exists node; then
    log_message "Instalando Node.js en Amazon Linux 2023..."
    
    # Método 1: Usando DNF para Node.js 18 (funciona mejor en AL2023)
    if dnf install -y nodejs npm >> "$LOG_FILE" 2>&1; then
        log_message "✅ Node.js instalado correctamente con dnf"
    # Método 2: Fallback a YUM si DNF no funciona
    elif yum install -y nodejs npm >> "$LOG_FILE" 2>&1; then
        log_message "✅ Node.js instalado correctamente con yum"
    # Método 3: Usando NodeSource como última opción
    elif curl -fsSL https://rpm.nodesource.com/setup_18.x | bash - >> "$LOG_FILE" 2>&1 && \
         dnf install -y nodejs >> "$LOG_FILE" 2>&1; then
        log_message "✅ Node.js instalado correctamente desde NodeSource"
    else
        log_message "❌ Error al instalar Node.js con todos los métodos"
        exit 1
    fi
else
    log_message "✅ Node.js ya está instalado"
fi
    else
        log_message "❌ Error al instalar Node.js"
        exit 1
    fi
else
    log_message "✅ Node.js ya está instalado ($(node --version))"
fi

# Crear página web personalizada
log_message "Creando página web personalizada..."

# Verificar que podemos escribir en /var/www/html
if ! mkdir -p "$WEB_DIR" 2>>"$LOG_FILE"; then
    log_message "❌ ERROR: No se puede crear directorio $WEB_DIR (permisos insuficientes)"
    exit 1
fi

if [ ! -w "$WEB_DIR" ]; then
    log_message "❌ ERROR: No se puede escribir en $WEB_DIR (permisos insuficientes)"
    exit 1
fi

log_message "✅ Directorio web verificado: $WEB_DIR"

# Obtener información de la instancia
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "unknown")
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || echo "unknown")
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "unknown")

cat > "$WEB_DIR/index.html" << EOF
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Challenge - Repositorio Clonado</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background-color: #f0f0f0;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .status { 
            background: #d4edda; 
            border: 1px solid #c3e6cb; 
            color: #155724; 
            padding: 10px; 
            border-radius: 5px; 
            margin: 20px 0;
        }
        .info { background: #e7f3ff; border-color: #b3d9ff; color: #004085; }
        ul { text-align: left; display: inline-block; }
        .logs { 
            background: #f8f9fa; 
            border: 1px solid #dee2e6; 
            padding: 10px; 
            border-radius: 5px; 
            margin: 10px 0;
            font-family: monospace;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 AWS Challenge</h1>
        <div class="status">
            ✅ Repositorio clonado y configurado exitosamente
        </div>
        <div class="info status">
            <h3>📂 Estructura del proyecto disponible:</h3>
            <ul>
                <li>📁 frontend/ - Aplicación React</li>
                <li>📁 backend-api/ - API Backend</li>
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

log_message "✅ Página web creada: $(wc -c < "$WEB_DIR/index.html") bytes"

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

# Crear configuración limpia
cat > /etc/nginx/nginx.conf << 'EOF'
user nginx;
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
        index index.html index.htm;
        
        location / {
            try_files $uri $uri/ =404;
        }
        
        location /repo {
            alias /opt/webapp;
            autoindex on;
            autoindex_exact_size off;
            autoindex_localtime on;
        }
        
        location /api {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
        
        error_page 404 /404.html;
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
    if curl -s http://localhost | grep -q "AWS Challenge"; then
        log_message "✅ Página web funcionando correctamente"
    else
        log_message "⚠️ Página web no responde como esperado"
    fi
else
    log_message "❌ Error al iniciar nginx"
    systemctl status nginx --no-pager -l >> "$LOG_FILE" 2>&1
    exit 1
fi

# Crear archivo de información
cat > "$REPO_DIR/deployment-info.txt" << EOF
AWS Challenge - Información de despliegue
========================================

Fecha: $(date)
Instance ID: $INSTANCE_ID
Región: $REGION
IP Pública: $PUBLIC_IP

Repositorio: $REPO_DIR
Web root: $WEB_DIR
Página web: http://$PUBLIC_IP
Explorar código: http://$PUBLIC_IP/repo

Logs:
- Setup: $LOG_FILE
- Nginx access: /var/log/nginx/access.log
- Nginx error: /var/log/nginx/error.log

Para acceso SSH:
ssh -i your-key.pem ec2-user@$PUBLIC_IP
EOF

log_message "=== SETUP COMPLETADO EXITOSAMENTE ==="
log_message "Página web disponible en: http://$PUBLIC_IP"
log_message "Información guardada en: $REPO_DIR/deployment-info.txt"
