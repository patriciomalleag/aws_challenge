# Pipeline de Datos - AWS Academy Challenge

Una aplicación web completa para la ingesta y consulta de datos, construida con AWS CloudFormation, React, Node.js y servicios serverless.

## 🏗️ **Arquitectura**

### **Componentes Principales:**

1. **Frontend (React)**
   - Interfaz web moderna y responsiva
   - Ingestor de archivos CSV con detección automática de esquemas
   - Visualización de archivos cargados
   - **Interfaz de consultas SQL funcionando**

2. **Backend API (Node.js/Express)**
   - API REST para gestión de archivos
   - Subida de archivos CSV a S3
   - Gestión de metadatos en DynamoDB
   - **Procesamiento de consultas SQL directamente**
   - Lectura de CSVs desde S3 para queries
   - Integración con servicios AWS

3. **Infraestructura AWS**
   - **EC2**: Instancias web con Auto Scaling
   - **Application Load Balancer**: Distribución de carga
   - **S3**: Almacenamiento de archivos raw y curated
   - **DynamoDB**: Catálogo de metadatos
   - **Lambda**: Procesamiento ETL automático
   - **VPC**: Red privada con subnets públicas y privadas

## 🚀 **Funcionalidades**

### **Ingestor de Datos:**

- ✅ Subida de archivos CSV mediante drag & drop
- ✅ Detección automática de esquemas de datos
- ✅ Edición manual de esquemas antes de la ingesta
- ✅ Configuración de separadores, directorios y nombres de tabla
- ✅ Visualización de archivos cargados y su estado
- ✅ Prevención de sobrescritura accidental

### **Procesamiento ETL:**

- ✅ Conversión automática de CSV a Parquet
- ✅ Almacenamiento optimizado en bucket curated
- ✅ Actualización automática del catálogo de metadatos
- ✅ Procesamiento serverless con Lambda

### **Motor de Consultas SQL:**

- ✅ Ejecutar consultas SELECT sobre datos CSV
- ✅ Soporte para LIMIT, filtros básicos
- ✅ Procesamiento directo en el backend (sin Lambda Query)
- ✅ Lectura directa desde S3 Raw
- ✅ Visualización de resultados en tiempo real

### **Infraestructura:**

- ✅ Despliegue automatizado con CloudFormation
- ✅ Auto Scaling basado en CPU
- ✅ Load Balancer para alta disponibilidad
- ✅ Logs centralizados en CloudWatch
- ✅ Seguridad con Security Groups

## 📋 **Requisitos**

### **Para AWS Academy Learner Lab:**

- Cuenta de AWS Academy activa
- LabRole con permisos para S3, DynamoDB, EC2, Lambda, CloudWatch
- Acceso a GitHub para clonar el repositorio

### **Para Desarrollo Local:**

- Node.js 16+
- AWS CLI configurado
- Git

## 🛠️ **Instalación y Despliegue**

### **1. Clonar el Repositorio:**

```bash
git clone https://github.com/patriciomallea/aws_challenge.git
cd aws_challenge
```

### **2. Configurar AWS (Learner Lab):**

```bash
# Obtener credenciales del Learner Lab
aws configure
```

### **3. Desplegar Infraestructura:**

```bash
cd infra
./scripts/deploy-modular.sh
```

### **4. Acceder a la Aplicación:**

- **URL Principal**: `http://[ALB-DNS-NAME]`
- **API Health Check**: `http://[ALB-DNS-NAME]/health`

## 📁 **Estructura del Proyecto**

```bash
aws_challenge/
├── frontend/                 # Aplicación React
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   │   ├── Home.js      # Página principal
│   │   │   ├── Ingestor.js  # Ingestor de datos
│   │   │   └── Queries.js   # Motor de consultas SQL
│   │   ├── App.js           # Componente principal
│   │   └── index.js         # Punto de entrada
│   └── package.json
├── backend-api/             # API Node.js/Express
│   ├── server.js            # Servidor principal (incluye motor SQL)
│   └── package.json
├── lambda-etl/              # Lambda ETL (solo procesamiento)
│   ├── src/
│   │   ├── handlers/        # Manejadores de eventos
│   │   ├── services/        # Servicios de negocio
│   │   └── utils/           # Utilidades
│   └── package.json
├── infra/                   # Infraestructura CloudFormation
│   ├── templates/           # Templates CFN
│   ├── parameters/          # Parámetros
│   └── scripts/             # Scripts de despliegue
└── shared/                  # Código compartido
    ├── constants/           # Constantes
    └── utils/               # Utilidades compartidas
```

## 🔄 **Flujo de Datos**

### **1. Ingesta de Datos:**

```bash
Usuario → Frontend → Backend API → S3 Raw → Lambda ETL → S3 Curated + DynamoDB
```

### **2. Procesamiento ETL:**

```bash
S3 Event → Lambda ETL → CSV → Parquet → S3 Curated → Actualizar DynamoDB
```

### **3. Consultas SQL:**

```bash
Usuario → Frontend → Backend API → S3 Raw → Resultados
```

## 🎯 **Uso de la Aplicación**

### **Página Principal:**

- Dos botones principales: "Ingestor de Datos" y "Consultas"
- Información sobre las funcionalidades del sistema

### **Vista Consultas SQL:**

1. **Seleccionar Tabla**: Dropdown con tablas disponibles
2. **Editor SQL**: Escribir consultas SELECT con soporte para:
   - `SELECT * FROM "tabla"`
   - `SELECT columna1, columna2 FROM "tabla"`
   - `SELECT * FROM "tabla" LIMIT 10`
3. **Ejecutar Consulta**: Botón para procesar la query
4. **Resultados**: Tabla con datos obtenidos del CSV
5. **Información**: Tiempo de ejecución y número de filas

### **Vista Ingestor de Datos:**

1. **Ver Archivos Existentes**: Tabla con archivos cargados y su estado
2. **Subir Nuevo Archivo**:
   - Arrastrar archivo CSV o hacer clic para seleccionar
   - Configurar separador, directorio y nombre de tabla
   - Revisar y editar esquema automáticamente detectado
   - Hacer clic en "Ingestar Datos"

### **Proceso Automático:**

**Para Ingesta:**

1. El archivo se sube al bucket S3 Raw
2. Se guarda el esquema en DynamoDB
3. Lambda ETL se activa automáticamente
4. Convierte CSV a Parquet y lo guarda en bucket Curated
5. Actualiza el estado en DynamoDB

**Para Consultas:**

1. Usuario selecciona tabla y escribe query SQL
2. Frontend envía consulta al Backend API
3. Backend busca archivos en DynamoDB
4. Backend lee CSV directamente desde S3 Raw
5. Backend parsea y filtra datos según la query
6. Frontend muestra resultados en tiempo real

## 🔧 **Configuración Avanzada**

### **Variables de Entorno:**

```bash
# Backend API
PORT=8080
AWS_REGION=us-east-1
S3_BUCKET_RAW=data-pipeline-raw-ACCOUNT_ID
S3_BUCKET_CURATED=data-pipeline-curated-ACCOUNT_ID
DDB_TABLE_NAME=datasets-catalog
LAMBDA_ETL_FUNCTION_NAME=data-pipeline-etl-function
```

### **Permisos IAM Requeridos:**

- S3: GetObject, PutObject, ListBucket
- DynamoDB: GetItem, PutItem, UpdateItem, Query, Scan
- CloudWatch: CreateLogGroup, CreateLogStream, PutLogEvents

## 🐛 **Troubleshooting**

### **Problemas Comunes:**

1. **Error de permisos IAM:**
   - Verificar que LabRole tenga permisos suficientes
   - Contactar al instructor si es necesario

2. **Archivo no se procesa:**
   - Verificar logs de Lambda ETL en CloudWatch
   - Comprobar que el archivo sea CSV válido

3. **Aplicación no responde:**
   - Verificar que las instancias EC2 estén corriendo
   - Revisar logs de Nginx y PM2

### **Comandos de Diagnóstico:**

```bash
# Verificar estado de la infraestructura
aws cloudformation describe-stacks --stack-name data-pipeline

# Ver logs de Lambda ETL
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/data-pipeline-etl"

# Ver instancias EC2
aws ec2 describe-instances --filters "Name=tag:Project,Values=data-pipeline"
```

## 📈 **Monitoreo**

### **CloudWatch Logs:**

- `/aws/ec2/webapp` - Logs de la aplicación web
- `/aws/ec2/nginx/access` - Logs de acceso de Nginx
- `/aws/ec2/nginx/error` - Logs de error de Nginx
- `/aws/lambda/data-pipeline-etl` - Logs de Lambda ETL

### **Métricas:**

- CPU y memoria de instancias EC2
- Latencia del Application Load Balancer
- Errores de Lambda ETL
- Uso de S3 y DynamoDB

## 📄 **Licencia**

Este proyecto está bajo la licencia MIT. Ver archivo `LICENSE` para más detalles.

## 👥 **Contribución**

Para contribuir al proyecto:

1. Fork el repositorio
2. Crear una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Crear un Pull Request

---

**Desarrollado para el MCDS de IMMUNE usando AWS Academy Learner Lab** 🚀
