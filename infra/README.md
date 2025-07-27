# Infraestructura como Código - CloudFormation Modular

## Propósito

Este módulo define toda la infraestructura AWS necesaria para el pipeline de datos serverless utilizando CloudFormation modular. La infraestructura está organizada en stacks separados por tipo de recurso para facilitar el mantenimiento, testing y despliegue.

## Arquitectura Modular

```
┌─────────────────────────────────────────────────────┐
│                    Stack Principal                  │
│                    (main.yaml)                      │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Network   │  │   Storage   │  │   Lambda    │  │
│  │   Stack     │  │   Stack     │  │   Stack     │  │
│  │             │  │             │  │             │  │
│  │ • VPC       │  │ • S3 Buckets│  │ • Lambda    │  │
│  │ • Subnets   │  │ • DynamoDB  │  │   Functions │  │
│  │ • NAT GW    │  │ • Policies  │  │ • URLs      │  │
│  │ • Security  │  │ • Lifecycle │  │ • Alarms    │  │
│  │   Groups    │  │ • Rules     │  │ • Logs      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Estructura del Proyecto

```
infra/
├── templates/                    # Templates de CloudFormation
│   ├── main.yaml                # Stack principal (orquestador)
│   ├── network.yaml             # Recursos de red
│   ├── storage.yaml             # Recursos de almacenamiento
│   └── lambda.yaml              # Funciones Lambda y recursos
├── parameters/                   # Archivos de parámetros
│   ├── main.json                # Parámetros del stack principal
│   ├── network.json             # Parámetros de red
│   ├── storage.json             # Parámetros de almacenamiento
│   └── lambda.json              # Parámetros de Lambda
├── scripts/                      # Scripts de automatización
│   ├── deploy-modular.sh        # Despliegue modular
│   ├── destroy-modular.sh       # Eliminación modular
├── .github/workflows/           # GitHub Actions
│   └── deploy-infrastructure.yml # CI/CD pipeline
├── parameters.json              # Parámetros legacy
└── README.md                    # Esta documentación
```

## Stacks Modulares

### 1. Network Stack (`templates/network.yaml`)

**Recursos de Red:**
- **VPC**: Red virtual privada con CIDR 10.0.0.0/16
- **Internet Gateway**: Conectividad a internet
- **NAT Gateway**: Para que recursos privados accedan a internet
- **Subnets**: Pública (10.0.1.0/24) y Privada (10.0.2.0/24)
- **Route Tables**: Configuración de rutas de red
- **Security Groups**: Reglas de firewall para Lambda

**Parámetros:**
```json
{
  "Environment": "development",
  "VpcCidr": "10.0.0.0/16",
  "PublicSubnetCidr": "10.0.1.0/24",
  "PrivateSubnetCidr": "10.0.2.0/24"
}
```

### 2. Storage Stack (`templates/storage.yaml`)

**Recursos de Almacenamiento:**
- **S3 Bucket Raw**: Para archivos CSV originales
- **S3 Bucket Curated**: Para archivos Parquet procesados
- **DynamoDB Table**: Catálogo de datasets con metadatos
- **Bucket Policies**: Políticas de seguridad y acceso
- **Lifecycle Rules**: Gestión automática de versiones

**Parámetros:**
```json
{
  "Environment": "development",
  "S3BucketRaw": "data-pipeline-raw-123456789012",
  "S3BucketCurated": "data-pipeline-curated-123456789012",
  "DDBTableName": "datasets-catalog",
  "LabRoleArn": "arn:aws:iam::123456789012:role/LabRole"
}
```

### 3. Lambda Stack (`templates/lambda.yaml`)

**Recursos de Computación:**
- **Lambda ETL Function**: Procesamiento de archivos CSV
- **Lambda Query Function**: Consultas SQL ad-hoc
- **Lambda URLs**: Endpoints públicos para consultas
- **CloudWatch Log Groups**: Logs estructurados
- **CloudWatch Alarms**: Monitoreo de errores y rendimiento
- **S3 Event Notifications**: Triggers automáticos

**Parámetros:**
```json
{
  "Environment": "development",
  "LabRoleArn": "arn:aws:iam::123456789012:role/LabRole",
  "LambdaMemorySize": 1024,
  "LambdaTimeout": 300
}
```

## Configuración para AWS Academy Learner Lab

### Variables de Entorno Requeridas

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=default

# GitHub Secrets (para CI/CD)
LAB_ROLE_ARN=arn:aws:iam::123456789012:role/LabRole
S3_BUCKET_RAW=data-pipeline-raw-123456789012
S3_BUCKET_CURATED=data-pipeline-curated-123456789012
DDB_TABLE_NAME=datasets-catalog
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Configuración de GitHub Secrets

Para usar el CI/CD automático, configura estos secrets en tu repositorio:

1. Ve a **Settings** → **Secrets and variables** → **Actions**
2. Agrega los siguientes secrets:
   - `LAB_ROLE_ARN`: ARN del rol LabRole preasignado
   - `S3_BUCKET_RAW`: Nombre del bucket S3 para archivos raw
   - `S3_BUCKET_CURATED`: Nombre del bucket S3 para archivos curated
   - `DDB_TABLE_NAME`: Nombre de la tabla DynamoDB
   - `AWS_ACCESS_KEY_ID`: Access Key de AWS
   - `AWS_SECRET_ACCESS_KEY`: Secret Key de AWS

## Despliegue

### Opción 1: Despliegue Manual

```bash
# 1. Configurar variables de entorno
export LAB_ROLE_ARN="arn:aws:iam::123456789012:role/LabRole"
export S3_BUCKET_RAW="data-pipeline-raw-123456789012"
export S3_BUCKET_CURATED="data-pipeline-curated-123456789012"
export DDB_TABLE_NAME="datasets-catalog"
export ENVIRONMENT="development"

# 2. Desplegar infraestructura
cd infra
chmod +x scripts/deploy-modular.sh
./scripts/deploy-modular.sh
```

### Opción 2: Despliegue Automático (GitHub Actions)

El despliegue se ejecuta automáticamente cuando:
- Se hace push a las ramas `main` o `develop`
- Se modifican archivos en el directorio `infra/`
- Se ejecuta manualmente desde GitHub Actions

### Opción 3: Despliegue Individual de Stacks

```bash
# Desplegar solo red
aws cloudformation deploy \
  --template-file templates/network.yaml \
  --stack-name data-pipeline-network \
  --parameter-overrides file://parameters/network.json \
  --capabilities CAPABILITY_IAM

# Desplegar solo almacenamiento
aws cloudformation deploy \
  --template-file templates/storage.yaml \
  --stack-name data-pipeline-storage \
  --parameter-overrides file://parameters/storage.json \
  --capabilities CAPABILITY_IAM

# Desplegar solo Lambda
aws cloudformation deploy \
  --template-file templates/lambda.yaml \
  --stack-name data-pipeline-lambda \
  --parameter-overrides file://parameters/lambda.json \
  --capabilities CAPABILITY_IAM
```

## Eliminación

### Eliminación Manual

```bash
cd infra
chmod +x scripts/destroy-modular.sh
./scripts/destroy-modular.sh
```

### Eliminación Automática

1. Ve a **Actions** en GitHub
2. Selecciona **Deploy Infrastructure**
3. Haz clic en **Run workflow**
4. Selecciona **destroy** como acción
5. Ejecuta el workflow

## Ventajas de la Arquitectura Modular

### 🔧 **Mantenibilidad**
- Separación clara de responsabilidades
- Fácil identificación y corrección de problemas
- Testing independiente de cada stack

### 🚀 **Escalabilidad**
- Despliegue incremental de recursos
- Actualización selectiva de componentes
- Reutilización de stacks en otros proyectos

### 🔒 **Seguridad**
- Control granular de permisos por stack
- Aislamiento de recursos sensibles
- Auditoría independiente por componente

### 📊 **Monitoreo**
- Métricas específicas por tipo de recurso
- Alertas personalizadas por stack
- Logs estructurados por componente

### 🧪 **Testing**
- Validación independiente de templates
- Testing de integración por stack
- Rollback granular en caso de errores

## Monitoreo y Alertas

### CloudWatch Alarms

El stack de Lambda incluye alarmas automáticas para:

- **Errores de Lambda ETL**: Alerta cuando hay errores en el procesamiento
- **Errores de Lambda Query**: Alerta cuando hay errores en consultas
- **Duración de Lambda ETL**: Alerta cuando el procesamiento toma demasiado tiempo

### Métricas Disponibles

```bash
# Ver métricas de Lambda
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=data-pipeline-stack-ETL-Processor \
  --start-time $(date -d '1 hour ago' --iso-8601=seconds) \
  --end-time $(date --iso-8601=seconds) \
  --period 300 \
  --statistics Average

# Ver logs de Lambda
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/data-pipeline-stack"
```

## Troubleshooting

### Problemas Comunes

1. **Error de permisos LabRole**
   ```bash
   # Verificar que el rol existe y tiene permisos
   aws iam get-role --role-name LabRole
   aws iam list-attached-role-policies --role-name LabRole
   ```

2. **Error de VPC**
   ```bash
   # Verificar configuración de VPC
   aws ec2 describe-vpcs --vpc-ids vpc-xxxxxxxxx
   aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxxxxxxxx"
   ```

3. **Error de S3**
   ```bash
   # Verificar buckets y políticas
   aws s3 ls
   aws s3api get-bucket-policy --bucket your-bucket-name
   ```

### Comandos de Diagnóstico

```bash
# Verificar estado de stacks
aws cloudformation describe-stacks --stack-name data-pipeline-stack

# Ver eventos de stack
aws cloudformation describe-stack-events --stack-name data-pipeline-stack

# Verificar recursos específicos
aws lambda list-functions --query 'Functions[?contains(FunctionName, `data-pipeline-stack`)]'
aws s3 ls | grep data-pipeline
aws dynamodb describe-table --table-name datasets-catalog
```

## Costos Estimados

### Recursos por Stack

**Network Stack:**
- VPC + NAT Gateway: ~$45 USD/mes
- Internet Gateway: Gratis
- Security Groups: Gratis

**Storage Stack:**
- S3 Storage: ~$0.023 USD/GB/mes
- DynamoDB (On-Demand): ~$1.25 USD/millón de requests
- Lifecycle Rules: Gratis

**Lambda Stack:**
- Lambda Functions: ~$5-20 USD/mes (dependiendo del uso)
- CloudWatch Logs: ~$0.50 USD/GB
- CloudWatch Alarms: ~$0.10 USD/alarma/mes

### Optimización de Costos

1. **NAT Gateway**: Considerar NAT Instance para desarrollo
2. **Lambda**: Ajustar memoria y timeout según necesidades
3. **S3**: Implementar lifecycle policies más agresivas
4. **DynamoDB**: Usar On-Demand billing para cargas variables

## Próximos Pasos

1. **Configurar GitHub Secrets** con tus valores de AWS Academy
2. **Ejecutar el primer despliegue** usando GitHub Actions
3. **Verificar la infraestructura** desplegada
4. **Configurar monitoreo** adicional según necesidades
5. **Implementar CI/CD** para las funciones Lambda

## Referencias

- [AWS CloudFormation Nested Stacks](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-nested-stacks.html)
- [AWS Academy Learner Lab](https://awsacademy.instructure.com/)
- [GitHub Actions for AWS](https://github.com/aws-actions/configure-aws-credentials)
- [CloudFormation Best Practices](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/best-practices.html) 