-- =====================================================
-- MANNOL POS · Migración v5.3 (mejoras 2026-11)
-- Ejecutar en Supabase → SQL Editor (idempotente, no toca datos).
--
-- Incluye:
--   1. products.thumb_url — miniatura 200px que sube la app junto
--      a la imagen principal (listas más livianas, ahorra cuota).
--   2. RPC deduct_sale_stock — descuento de stock ATÓMICO para la
--      sincronización de ventas offline: solo descuenta si hay
--      stock suficiente, así dos puestos que vendieron lo mismo
--      sin internet no dejan el inventario en negativo.
--   3. Tabla pin_attempts — auditoría de intentos de PIN
--      (detección de accesos no autorizados).
-- =====================================================

-- ===== 1. Miniatura de imagen de producto =====
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS thumb_url text;

-- ===== 2. RPC de descuento atómico de stock =====
-- Recibe los items de una venta ({product_id, quantity}) y descuenta
-- cada uno SOLO si hay stock disponible. Los items sin stock suficiente
-- NO se descuentan y se devuelven en "shortages" para avisar al usuario.
-- Registra el movimiento de auditoría por cada item descontado.
CREATE OR REPLACE FUNCTION public.deduct_sale_stock(
  p_warehouse_id uuid,
  p_items jsonb,
  p_reason text DEFAULT 'VENTA',
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         int;
  v_available   numeric;
  v_shortages   jsonb := '[]'::jsonb;
  v_deducted    int := 0;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'warehouse_null', 'deducted', 0, 'shortages', v_shortages);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(quantity, 0) INTO v_available
    FROM public.stock
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;

    IF v_available IS NULL OR v_available < v_qty THEN
      v_shortages := v_shortages || jsonb_build_object(
        'product_id', v_product_id,
        'requested', v_qty,
        'available', COALESCE(v_available, 0)
      );
    ELSE
      UPDATE public.stock
      SET quantity = quantity - v_qty,
          updated_at = now()
      WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;

      INSERT INTO public.stock_movements (warehouse_id, product_id, delta, reason, note, user_id, user_name)
      VALUES (p_warehouse_id, v_product_id, -v_qty, p_reason, p_note, p_user_id, p_user_name);

      v_deducted := v_deducted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (v_shortages = '[]'::jsonb),
    'deducted', v_deducted,
    'shortages', v_shortages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_sale_stock(uuid, jsonb, text, text, uuid, text) TO anon, authenticated;

-- ===== 3. Auditoría de intentos de PIN =====
-- La app registra (best-effort) cada intento fallido de PIN de almacén.
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  warehouse_code text,
  ok boolean NOT NULL DEFAULT false,
  device text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede registrar un intento (las sesiones PIN son anon)
DROP POLICY IF EXISTS pin_attempts_insert ON public.pin_attempts;
CREATE POLICY pin_attempts_insert ON public.pin_attempts
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Solo admins leen el historial
DROP POLICY IF EXISTS pin_attempts_read_admin ON public.pin_attempts;
CREATE POLICY pin_attempts_read_admin ON public.pin_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_uid = auth.uid() AND u.role = 'admin' AND u.active
    )
  );

CREATE INDEX IF NOT EXISTS pin_attempts_warehouse_time
  ON public.pin_attempts (warehouse_id, attempted_at DESC);

-- ===== Verificación (opcional) =====
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'products' AND column_name = 'thumb_url';
-- SELECT proname FROM pg_proc WHERE proname = 'deduct_sale_stock';
-- SELECT count(*) FROM public.pin_attempts;
