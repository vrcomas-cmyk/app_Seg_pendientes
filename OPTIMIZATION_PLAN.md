# Plan de Optimizaciones MSC - Respaldo y Referencia

**Fecha:** 2026-04-07
**Rama:** `feat/msc-optimizations`
**Estado:** En progreso

## Cambios Planificados (SEGUROS - No afectan funcionalidad)

### 1. Interfaces TypeScript
- Crear `frontend-web/src/types/msc.ts`
- Reemplazar `any` con tipos específicos
- Archivos afectados:
  - MscListPage.tsx
  - MscNewPage.tsx
  - MscDetailPage.tsx
  - MscInventoryPage.tsx

### 2. Memoización de Cálculos (useMemo)
- MscDetailPage: `cantRecibida()`, `cantEntregada()`
- MscInventoryPage: Cálculos FIFO
- Beneficio: 10-100x más rápido

### 3. Extraer Componentes
- MscDetailPage (1628 líneas → múltiples componentes <300 líneas):
  - MscDetailHeader
  - MscItemsSection
  - MscRecepcionesSection
  - MscSalidasSection
  - MscEvidenciasSection
  - MscCedisModal

### 4. Debounce en Búsquedas
- MscListPage: Search con 300ms delay
- MscInventoryPage: Búsqueda de inventario

### 5. Reutilizar Componentes
- Un único `SearchInput<T>` para:
  - MaterialInput
  - ClienteInput
  - Eliminar duplicación

## ⚠️ Estado Actual (Backup)

- ✅ Código compila: `npm run build` pasa sin errores
- ✅ Rutas funcionan: /msc, /msc/nueva, /msc/:id, /msc/inventario
- ✅ Reportes generan Excel correctamente
- ✅ Todas las operaciones CRUD funcionan

## 🔄 Si Algo Falla

```bash
# Volver a main (estado antes de optimizaciones)
git checkout main

# Ver cambios realizados
git diff main feat/msc-optimizations

# Revertir rama de optimizaciones
git branch -D feat/msc-optimizations
```

## ✅ Checklist de Testing Post-Optimización

- [ ] Build sin errores: `npm run build`
- [ ] Crear nueva solicitud: /msc/nueva
- [ ] Guardar borrador
- [ ] Guardar y enviar
- [ ] Ver listado: /msc
- [ ] Filtrar solicitudes
- [ ] Buscar (verificar debounce)
- [ ] Ver detalle: /msc/:id
- [ ] Agregar recepción
- [ ] Subir evidencia
- [ ] Descargar reporte Excel
- [ ] Ver inventario: /msc/inventario
- [ ] Crear salida desde inventario

## 📊 Cambios Esperados

| Métrica | Antes | Después |
|---------|-------|---------|
| Líneas MscDetailPage | 1628 | ~300 |
| Type safety | Muchos `any` | 100% tipado |
| Re-renders innecesarios | Alto | Bajo (useMemo) |
| Mantenibilidad | Difícil | Fácil |
| Funcionalidad | 100% | 100% (idéntica) |

