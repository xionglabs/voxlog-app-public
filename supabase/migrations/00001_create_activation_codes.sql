
-- ============ 激活码表 ============
CREATE TABLE activation_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  level        text NOT NULL CHECK (level IN ('standard', 'pro')),
  duration_days int NOT NULL DEFAULT 365,
  device_id    text,
  activated_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz DEFAULT now(),
  note         text
);

ALTER TABLE activation_codes ENABLE ROW LEVEL SECURITY;

-- ============ 生成激活码辅助函数 ============
CREATE OR REPLACE FUNCTION generate_activation_codes(
  count       int,
  p_level     text,
  duration    int,
  batch_note  text DEFAULT ''
) RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_code text;
  i int;
BEGIN
  FOR i IN 1..count LOOP
    LOOP
      new_code := 'VL-'
        || upper(substring(md5(random()::text) FROM 1 FOR 4))
        || '-'
        || upper(substring(md5(random()::text) FROM 1 FOR 4));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM activation_codes ac WHERE ac.code = new_code);
    END LOOP;
    INSERT INTO activation_codes (code, level, duration_days, note)
    VALUES (new_code, p_level, duration, batch_note);
    RETURN NEXT new_code;
  END LOOP;
END;
$$;
