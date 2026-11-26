ALTER TABLE "envios_biblioteca" ADD COLUMN "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
ALTER TABLE "revisiones_silabo" ADD COLUMN "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.proteger_registro_con_campos_unicos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
        antes jsonb;
        despues jsonb;
        campo text;
    BEGIN
        IF reinicio_institucional_habilitado() THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        IF TG_OP = 'UPDATE' THEN
            antes := to_jsonb(OLD) - 'actualizado_en';
            despues := to_jsonb(NEW) - 'actualizado_en';
            FOREACH campo IN ARRAY TG_ARGV LOOP
                IF antes -> campo = 'null'::jsonb THEN
                    antes := antes - campo;
                    despues := despues - campo;
                END IF;
            END LOOP;
            IF antes = despues THEN
                RETURN NEW;
            END IF;
        END IF;
        RAISE EXCEPTION 'El registro histórico es inmutable' USING ERRCODE = '23514';
    END;
    $function$;

CREATE TRIGGER marcar_actualizado_en BEFORE UPDATE ON public.envios_biblioteca FOR EACH ROW EXECUTE FUNCTION marcar_actualizado_en();
CREATE TRIGGER marcar_actualizado_en BEFORE UPDATE ON public.revisiones_silabo FOR EACH ROW EXECUTE FUNCTION marcar_actualizado_en();
