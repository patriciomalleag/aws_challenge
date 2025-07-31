#!/bin/bash
# Verificación de compatibilidad Amazon Linux 2023
# Este script verifica que todo funciona correctamente en AL2023

echo "🔍 Verificando Amazon Linux 2023..."

# Verificar versión del sistema
echo "📋 Información del sistema:"
cat /etc/os-release | grep -E "PRETTY_NAME|VERSION"
echo ""

# Verificar kernel
echo "🔧 Versión del kernel:"
uname -r
echo ""

# Verificar DNF
echo "📦 Verificando DNF (gestor de paquetes):"
if command -v dnf >/dev/null 2>&1; then
    echo "✅ DNF está disponible"
    dnf --version | head -1
else
    echo "❌ DNF no está disponible"
fi
echo ""

# Verificar YUM (fallback)
echo "📦 Verificando YUM (fallback):"
if command -v yum >/dev/null 2>&1; then
    echo "✅ YUM está disponible como fallback"
    yum --version | head -1
else
    echo "❌ YUM no está disponible"
fi
echo ""

# Verificar repositorios disponibles
echo "📚 Repositorios disponibles para nginx:"
if command -v dnf >/dev/null 2>&1; then
    dnf search nginx 2>/dev/null | head -5
elif command -v yum >/dev/null 2>&1; then
    yum search nginx 2>/dev/null | head -5
fi
echo ""

# Verificar repositorios disponibles para Node.js
echo "📚 Repositorios disponibles para Node.js:"
if command -v dnf >/dev/null 2>&1; then
    dnf search nodejs 2>/dev/null | head -5
elif command -v yum >/dev/null 2>&1; then
    yum search nodejs 2>/dev/null | head -5
fi
echo ""

# Verificar glibc (problema anterior con AL2)
echo "🔗 Versión de glibc:"
ldd --version | head -1
echo ""

echo "✅ Verificación completa"
