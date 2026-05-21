ALTER TABLE public.extension_customizations
  ADD COLUMN IF NOT EXISTS color_wave_deep  text NOT NULL DEFAULT '#041436',
  ADD COLUMN IF NOT EXISTS color_wave_navy  text NOT NULL DEFAULT '#06205f',
  ADD COLUMN IF NOT EXISTS color_wave_blue  text NOT NULL DEFAULT '#0b63ce',
  ADD COLUMN IF NOT EXISTS color_wave_azure text NOT NULL DEFAULT '#168cff',
  ADD COLUMN IF NOT EXISTS color_wave_cyan  text NOT NULL DEFAULT '#4ddfff',
  ADD COLUMN IF NOT EXISTS color_wave_ice   text NOT NULL DEFAULT '#f8fbff';