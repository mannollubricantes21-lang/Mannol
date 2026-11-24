-- =====================================================
-- MANNOL POS · Migración v5.13 — Ventas sin conexión
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- Idempotente (se puede repetir sin problema) y NO borra datos.
--
-- Incluye:
--   1. RPC register_sale(p_sale) — sube UNA venta de la cola del equipo:
--        · guarda la venta y descuenta el stock en UNA sola transacción
--          (o todo o nada: nunca queda la venta sin descontar el stock);
--        · IDEMPOTENTE por client_ref: si la respuesta se pierde y la app
--          reintenta, NO se duplica la venta ni se descuenta dos veces;
--        · el stock se descuenta SIEMPRE del almacén de la venta, aunque
--          otros almacenes estén subiendo sus ventas a la vez;
--        · exige un almacén que exista: nunca guarda ventas "sin almacén";
--        · descuento atómico (UPDATE … WHERE quantity >= cantidad): dos
--          almacenes/puestos que suben a la vez no dejan stock negativo.
--          Si no alcanza, NO descuenta ese producto y lo devuelve en
--          "shortages" (la app avisa para revisar el inventario).
--   2. Corrección de update_sale_status: las ventas guardan sus productos
--      con la clave "product_id", pero la función leía "productId" y al
--      CANCELAR una venta completada fallaba (no devolvía el stock).
--      Ahora lee ambas claves y omite líneas sin producto.
--
-- Requisitos: schema.sql + policies.sql (cualquier versión 5.x).
-- =====================================================


-- ===== 1. register_sale =====
CREATE OR REPLACE FUNCTION public.register_sale(p_sale jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          text;
  v_client_ref  text;
  v_existing    text;
  v_wh_id       uuid;
  v_wh_code     text;
  v_wh_name     text;
  v_status      text;
  v_code        text;
  v_user_id     uuid;
  v_user_name   text;
  v_sale        jsonb;
  v_cols        text;
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         numeric;
  v_left        numeric;
  v_available   numeric;
  v_shortages   jsonb := '[]'::jsonb;
  v_deducted    int := 0;
  v_uuid_re     constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'MANNOL_SALE_INVALID: venta vacía';
  END IF;

  v_id := NULLIF(btrim(p_sale->>'id'), '');
  v_client_ref := NULLIF(btrim(p_sale->>'client_ref'), '');
  IF v_id IS NULL OR v_client_ref IS NULL THEN
    RAISE EXCEPTION 'MANNOL_SALE_INVALID: falta id o client_ref';
  END IF;

  -- Reintentos simultáneos de la MISMA venta (dos pestañas, respuesta
  -- perdida…) se ejecutan uno detrás de otro.
  PERFORM pg_advisory_xact_lock(hashtext('mannol_register_sale'), hashtext(v_client_ref));

  -- ¿Ya está subida? → no tocar nada (ni venta ni stock)
  SELECT id INTO v_existing FROM public.sales WHERE client_ref = v_client_ref LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_existing,
                              'deducted', 0, 'shortages', '[]'::jsonb);
  END IF;

  -- Almacén: obligatorio y existente (sin almacén no se guarda: así una
  -- venta nunca queda mezclada/sin dueño).
  IF COALESCE(p_sale->>'warehouse_id', '') !~ v_uuid_re THEN
    RAISE EXCEPTION 'MANNOL_WAREHOUSE_NOT_FOUND: la venta % no tiene un almacén válido', v_id;
  END IF;
  SELECT w.id, w.code, w.name INTO v_wh_id, v_wh_code, v_wh_name
    FROM public.warehouses w WHERE w.id = (p_sale->>'warehouse_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MANNOL_WAREHOUSE_NOT_FOUND: el almacén de la venta % ya no existe', v_id;
  END IF;

  -- Mismo id ya guardado:
  --   · sin client_ref → la subió una versión antigua de la app: es la MISMA
  --     venta → duplicado (no se guarda ni se descuenta otra vez);
  --   · con otro client_ref → otra venta con id repetido (casi imposible):
  --     id nuevo, sin perderla.
  SELECT client_ref INTO v_existing FROM public.sales WHERE id = v_id;
  IF FOUND THEN
    IF v_existing IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_id,
                                'deducted', 0, 'shortages', '[]'::jsonb);
    END IF;
    v_id := v_id || '-' || substr(md5(v_client_ref), 1, 6);
  END IF;

  v_sale := p_sale || jsonb_build_object(
    'id', v_id,
    'warehouse_id', v_wh_id,
    'warehouse_code', COALESCE(NULLIF(p_sale->>'warehouse_code', ''), v_wh_code),
    'warehouse_name', COALESCE(NULLIF(p_sale->>'warehouse_name', ''), v_wh_name),
    'synced_at', now()
  );

  -- Columnas uuid con valores que no son uuid (ej. "pin-1789…" de una
  -- sesión PIN): se omiten en vez de fallar (igual que hace la app).
  SELECT v_sale - COALESCE(array_agg(a.attname::text), ARRAY[]::text[])
    INTO v_sale
    FROM pg_attribute a
   WHERE a.attrelid = 'public.sales'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.atttypid = 'uuid'::regtype
     AND v_sale ? a.attname
     AND jsonb_typeof(v_sale -> a.attname) <> 'null'
     AND (v_sale ->> a.attname) !~ v_uuid_re;

  -- Columnas recibidas que existen en la tabla (las que faltan o vienen
  -- null toman el valor por defecto de la tabla).
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = 'public.sales'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attgenerated = ''
     AND v_sale ? a.attname
     AND jsonb_typeof(v_sale -> a.attname) <> 'null';

  BEGIN
    EXECUTE format(
      'INSERT INTO public.sales (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.sales, $1)',
      v_cols
    ) USING v_sale;
  EXCEPTION WHEN unique_violation THEN
    -- Otra subida de la misma venta ganó la carrera (método anterior)
    SELECT id INTO v_existing FROM public.sales WHERE client_ref = v_client_ref LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_existing,
                                'deducted', 0, 'shortages', '[]'::jsonb);
    END IF;
    RAISE;
  END;

  -- Stock: solo ventas COMPLETADAS, solo del almacén de la venta
  v_status := COALESCE(NULLIF(v_sale->>'status', ''), 'PENDIENTE');
  IF v_status = 'COMPLETADA' THEN
    v_code := COALESCE(NULLIF(v_sale->>'code', ''), v_id);
    v_user_id := CASE WHEN COALESCE(v_sale->>'user_id', '') ~ v_uuid_re THEN (v_sale->>'user_id')::uuid END;
    v_user_name := NULLIF(v_sale->>'user_name', '');

    FOR v_item IN
      SELECT value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_sale->'items') = 'array' THEN v_sale->'items' ELSE '[]'::jsonb END
      )
    LOOP
      v_product_id := CASE
        WHEN COALESCE(v_item->>'product_id', v_item->>'productId', '') ~ v_uuid_re
        THEN COALESCE(v_item->>'product_id', v_item->>'productId')::uuid
      END;
      v_qty := CASE
        WHEN COALESCE(v_item->>'quantity', '') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
        THEN (v_item->>'quantity')::numeric
        ELSE 0
      END;
      IF v_product_id IS NULL OR v_qty <= 0 THEN
        CONTINUE;
      END IF;

      UPDATE public.stock
         SET quantity = quantity - v_qty,
             updated_at = now()
       WHERE warehouse_id = v_wh_id
         AND product_id = v_product_id
         AND quantity >= v_qty
      RETURNING quantity INTO v_left;

      IF FOUND THEN
        INSERT INTO public.stock_movements (warehouse_id, product_id, delta, reason, note, user_id, user_name)
        VALUES (v_wh_id, v_product_id, -v_qty, 'VENTA', 'Venta ' || v_code, v_user_id, v_user_name);
        v_deducted := v_deducted + 1;
      ELSE
        SELECT quantity INTO v_available
          FROM public.stock
         WHERE warehouse_id = v_wh_id AND product_id = v_product_id;
        v_shortages := v_shortages || jsonb_build_object(
          'product_id', v_product_id,
          'requested', v_qty,
          'available', COALESCE(v_available, 0)
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'sale_id', v_id,
    'deducted', v_deducted,
    'shortages', v_shortages
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_sale(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_sale(jsonb) TO anon, authenticated;


-- ===== 2. update_sale_status: leer "product_id" (y "productId") =====
CREATE OR REPLACE FUNCTION public.update_sale_status(
  p_sale_id text,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_sale record;
  v_item jsonb;
  v_pid  text;
  v_qty  numeric;
BEGIN
  SELECT * FROM public.sales WHERE id = p_sale_id INTO v_sale;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_sale.status = p_new_status THEN
    RETURN;
  END IF;

  -- COMPLETADA: descontar stock
  IF p_new_status = 'COMPLETADA' THEN
    IF v_sale.warehouse_id IS NOT NULL THEN
      FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) LOOP
        v_pid := COALESCE(v_item->>'product_id', v_item->>'productId');
        v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
        CONTINUE WHEN v_pid IS NULL OR v_pid = '' OR v_qty <= 0;
        PERFORM public.adjust_stock(v_sale.warehouse_id, v_pid::uuid, -v_qty,
                                    'VENTA', 'Venta ' || COALESCE(v_sale.code, v_sale.id), p_user_id, p_user_name);
      END LOOP;
    END IF;
    UPDATE public.sales SET status = 'COMPLETADA', completed_at = now() WHERE id = p_sale_id;

  -- CANCELADA: devolver el stock si venía de COMPLETADA
  ELSIF p_new_status = 'CANCELADA' AND v_sale.status = 'COMPLETADA' THEN
    IF v_sale.warehouse_id IS NOT NULL THEN
      FOR v_item IN SELECT jsonb_array_elements(COALESCE(v_sale.items, '[]'::jsonb)) LOOP
        v_pid := COALESCE(v_item->>'product_id', v_item->>'productId');
        v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
        CONTINUE WHEN v_pid IS NULL OR v_pid = '' OR v_qty <= 0;
        PERFORM public.adjust_stock(v_sale.warehouse_id, v_pid::uuid, v_qty,
                                    'CANCELACION', 'Cancelación ' || COALESCE(v_sale.code, v_sale.id), p_user_id, p_user_name);
      END LOOP;
    END IF;
    UPDATE public.sales SET status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_sale_id;

  ELSIF p_new_status = 'CANCELADA' THEN
    UPDATE public.sales SET status = 'CANCELADA', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_sale_id;

  ELSIF p_new_status = 'PENDIENTE' THEN
    -- REABRIR (CANCELADA → PENDIENTE): no toca stock
    UPDATE public.sales SET status = 'PENDIENTE', cancelled_at = NULL, cancel_reason = NULL WHERE id = p_sale_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ===== Verificación (opcional) =====
-- SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('register_sale', 'update_sale_status');
-- SELECT public.register_sale('{}'::jsonb);  -- debe responder: MANNOL_SALE_INVALID
