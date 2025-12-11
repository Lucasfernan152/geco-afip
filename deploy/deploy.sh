#!/bin/bash

# ============================================
# Deploy GECO AFIP Service desde Docker Hub
# ============================================

set -e

# ====== CONFIGURACIÓN ======
EC2_USER="ec2-user"
EC2_HOST="18.231.210.243"
EC2_KEY="$HOME/.ssh/stock-ec2.pem"
PROJECT_DIR_BASE="/home/ec2-user/geco-afip"
DOCKER_USERNAME="gecomanagmentapp"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ====== FUNCIONES ======
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ====== VALIDAR ARGUMENTOS ======
if [ "$#" -ne 1 ]; then
    print_error "Uso: $0 <dev|prod>"
    echo ""
    echo "Ejemplos:"
    echo "  $0 dev   # Deploy a desarrollo (puerto 5002)"
    echo "  $0 prod  # Deploy a producción (puerto 4002)"
    exit 1
fi

ENV=$1

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    print_error "Entorno inválido. Usa 'dev' o 'prod'"
    exit 1
fi

# ====== CONFIGURAR SEGÚN ENTORNO ======
PROJECT_DIR="$PROJECT_DIR_BASE/$ENV"
ENV_FILE="../.env.$ENV"

if [ "$ENV" = "prod" ]; then
    API_PORT=4002
else
    API_PORT=5002
fi

echo ""
echo "════════════════════════════════════════"
echo "   🐳 DEPLOY GECO AFIP Service - $ENV"
echo "════════════════════════════════════════"
echo ""
echo "  API: http://$EC2_HOST:$API_PORT"
echo "  Destino: $PROJECT_DIR"
echo ""

# ====== VERIFICACIONES ======
if [ ! -f "$EC2_KEY" ]; then
    print_error "No se encuentra el archivo SSH: $EC2_KEY"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    print_error "No se encontró $ENV_FILE"
    print_warning "Crea el archivo con: cp deploy/env-templates/$ENV.env.template ../.env.$ENV"
    exit 1
fi

# Confirmación para prod
if [ "$ENV" = "prod" ]; then
    echo ""
    print_warning "⚠️  Vas a deployar a PRODUCCIÓN"
    read -p "¿Continuar? (escribe 'si'): " CONFIRM
    if [ "$CONFIRM" != "si" ]; then
        print_warning "Deploy cancelado"
        exit 0
    fi
fi

# ====== VERIFICAR CONEXIÓN ======
print_step "Verificando conexión con EC2..."
if ! ssh -i "$EC2_KEY" -o ConnectTimeout=5 "$EC2_USER@$EC2_HOST" exit 2>/dev/null; then
    print_error "No se puede conectar a EC2"
    exit 1
fi
print_success "Conexión OK"

# ====== CREAR DIRECTORIO ======
print_step "Creando directorio en servidor..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" "mkdir -p $PROJECT_DIR"
print_success "Directorio creado"

# ====== COPIAR ARCHIVOS ======
print_step "Copiando archivos de configuración..."
scp -i "$EC2_KEY" docker-compose.hub.yml "$EC2_USER@$EC2_HOST:$PROJECT_DIR/docker-compose.yml"
scp -i "$EC2_KEY" "$ENV_FILE" "$EC2_USER@$EC2_HOST:$PROJECT_DIR/.env"
print_success "Archivos copiados"

# ====== DEPLOY CON DOCKER ======
print_step "Desplegando con Docker..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" bash << EOF
    set -e
    cd $PROJECT_DIR
    
    # Verificar Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker no está instalado"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ docker-compose no está instalado"
        exit 1
    fi
    
    # Verificar que existe .env
    if [ ! -f .env ]; then
        echo "❌ Archivo .env no encontrado en \$(pwd)"
        exit 1
    fi
    
    # Cargar variables del archivo .env
    set -a
    source .env
    set +a
    
    echo "🛑 Deteniendo contenedor anterior (si existe)..."
    docker-compose down --remove-orphans 2>/dev/null || true
    
    echo "📥 Pulling imagen de Docker Hub..."
    docker-compose pull
    
    echo "🚀 Levantando contenedor..."
    docker-compose up -d
    
    echo "✅ Contenedor desplegado"
EOF

print_success "Deploy completado"

# ====== VERIFICAR ESTADO ======
print_step "Verificando estado..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" "cd $PROJECT_DIR && docker-compose ps"

# ====== HEALTH CHECK ======
print_step "Esperando health check..."
sleep 5

if curl -s -f "http://$EC2_HOST:$API_PORT/health" > /dev/null 2>&1; then
    print_success "AFIP Service OK (puerto $API_PORT)"
else
    print_warning "AFIP Service no responde aún (puede tardar unos segundos más)"
fi

echo ""
echo "════════════════════════════════════════"
echo -e "${GREEN}✓ Deploy $ENV completado!${NC}"
echo "════════════════════════════════════════"
echo ""
echo "🌐 AFIP Service disponible en:"
echo "  → http://$EC2_HOST:$API_PORT"
echo "  → Health: http://$EC2_HOST:$API_PORT/health"
echo ""
echo "📊 Comandos útiles:"
echo ""
echo "  Ver logs:"
echo "    ssh -i $EC2_KEY $EC2_USER@$EC2_HOST 'cd ~/geco-afip/$ENV && docker-compose logs -f'"
echo ""
echo "  Ver estado:"
echo "    ssh -i $EC2_KEY $EC2_USER@$EC2_HOST 'cd ~/geco-afip/$ENV && docker-compose ps'"
echo ""
echo "  Reiniciar:"
echo "    ssh -i $EC2_KEY $EC2_USER@$EC2_HOST 'cd ~/geco-afip/$ENV && docker-compose restart'"
echo ""
echo "  Detener:"
echo "    ssh -i $EC2_KEY $EC2_USER@$EC2_HOST 'cd ~/geco-afip/$ENV && docker-compose down'"
echo ""

