-- =====================================================
-- Migración v4 — Motivos de transferencia en stock_movements
-- =====================================================
-- PROBLEMA: al confirmar una transferencia, el sistema registra
-- movimientos con motivo TRANSFERENCIA_SALIDA / TRANSFERENCIA_ENTRADA,
-- pero el CHECK constraint original de stock_movements.reason solo
-- permitía: AJUSTE_MANUAL, INVENTARIO, MERMA, DEVOLUCION, VENTA,
-- CANCELACION, REABRIR. El INSERT fallaba y la transferencia no se
-- podía confirmar (el stock nunca se movía).
--
-- SOLUCIÓN: ampliar el constraint para aceptar los dos motivos nuevos.
--
-- CÓMO EJECUTARLO: Supabase → SQL Editor → New query → pegar todo
-- este archivo → Run. Es seguro ejecutarlo varias veces (idempotente).
-- =====================================================

alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;

alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason in (
    'AJUSTE_MANUAL',
    'INVENTARIO',
    'MERMA',
    'DEVOLUCION',
    'VENTA',
    'CANCELACION',
    'REABRIR',
    'TRANSFERENCIA_SALIDA',
    'TRANSFERENCIA_ENTRADA'
  ));
