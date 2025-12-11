#!/bin/bash

# ============================================
# Build y Push de Imagen Docker a Docker Hub
# GECO AFIP Service
# ============================================

set -e

# ====== CONFIGURACIÓN ======
DOCKER_USERNAME="gecomanagmentapp"
IMAGE_NAME="geco-afip"

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
    echo "  $0 dev   # Build y push versión desarrollo (puerto 5002)"
    echo "  $0 prod  # Build y push versión producción (puerto 4002)"
    exit 1
fi

ENV=$1

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    print_error "Entorno inválido. Usa 'dev' o 'prod'"
    exit 1
fi

# ====== CONFIGURAR VERSIÓN ======
VERSION=$(date +%Y%m%d-%H%M%S)
TAG="$ENV-$VERSION"
TAG_LATEST="$ENV-latest"

echo ""
echo "════════════════════════════════════════"
echo "   🐳 BUILD & PUSH - GECO AFIP Service ($ENV)"
echo "════════════════════════════════════════"
echo ""
echo "  Versión: $TAG"
echo "  Docker Hub: $DOCKER_USERNAME"
echo ""

# ====== SETUP COLIMA ======
print_step "Configurando entorno Docker (Colima)..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/setup-colima.sh" ]; then
    source "$SCRIPT_DIR/setup-colima.sh"
else
    print_warning "setup-colima.sh no encontrado, verificando manualmente..."
    if docker context inspect colima &>/dev/null; then
        docker context use colima > /dev/null 2>&1
    fi
fi
echo ""

# ====== VERIFICAR DOCKER LOGIN ======
print_step "Verificando login en Docker Hub..."

# Asegurar que estamos usando Colima
if docker context inspect colima &>/dev/null; then
    docker context use colima > /dev/null 2>&1
    print_success "Usando Colima como contexto Docker"
fi

if ! docker info > /dev/null 2>&1; then
    print_error "Docker no está corriendo"
    print_warning "Inicia Colima con: colima start"
    exit 1
fi

if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
    print_warning "No estás logueado en Docker Hub"
    print_step "Logueando en Docker Hub..."
    docker login
fi
print_success "Docker Hub OK"

# ====== BUILD LOCAL (TypeScript) ======
print_step "Compilando código TypeScript..."
cd ..  # Ir al directorio raíz del proyecto
npm run build
print_success "Código compilado"
cd deploy

# ====== SETUP BUILDX (multi-platform) ======
print_step "Configurando Docker Buildx..."
if ! docker buildx ls | grep -q "multiplatform-builder"; then
    print_step "Creando builder multiplatform-builder..."
    docker buildx create --name multiplatform-builder --driver docker-container --use
    docker buildx inspect --bootstrap
else
    docker buildx use multiplatform-builder
    # Verificar que el builder esté corriendo
    if ! docker buildx inspect multiplatform-builder | grep -q "Status.*running"; then
        print_warning "Builder no está corriendo, reiniciando..."
        docker buildx rm multiplatform-builder
        docker buildx create --name multiplatform-builder --driver docker-container --use
        docker buildx inspect --bootstrap
    fi
fi
print_success "Buildx configurado"

# ====== BUILD & PUSH IMAGE ======
print_step "Construyendo imagen Docker (multi-plataforma)..."
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -f Dockerfile \
    -t "$DOCKER_USERNAME/$IMAGE_NAME:$TAG" \
    -t "$DOCKER_USERNAME/$IMAGE_NAME:$TAG_LATEST" \
    --push \
    ..

print_success "Imagen construida y subida"

echo ""
echo "════════════════════════════════════════"
echo -e "${GREEN}✓ Build & Push completado!${NC}"
echo "════════════════════════════════════════"
echo ""
echo "📦 Imágenes disponibles:"
echo "  → $DOCKER_USERNAME/$IMAGE_NAME:$TAG"
echo "  → $DOCKER_USERNAME/$IMAGE_NAME:$TAG_LATEST"
echo ""
echo "🚀 Siguiente paso:"
echo "  ./deploy.sh $ENV"
echo ""

