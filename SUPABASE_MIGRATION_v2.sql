-- ============================================================
-- SASYNA PLATFORM — Migration v2
-- Run in Supabase SQL Editor:
-- Dashboard → SQL Editor → New query → paste & run
-- ============================================================

-- Add Complete Research Project price column to level_pricing
ALTER TABLE IF EXISTS public.level_pricing
  ADD COLUMN IF NOT EXISTS complete_research_project_price NUMERIC(10,2) DEFAULT 0;

-- Add Complete Research Project price column to pricing_config  
ALTER TABLE IF EXISTS public.pricing_config
  ADD COLUMN IF NOT EXISTS complete_research_project_price NUMERIC(10,2) DEFAULT 2500;

-- Update any existing level_pricing rows to set default Complete Research Project price
UPDATE public.level_pricing
  SET complete_research_project_price = COALESCE(research_project_price + research_proposal_price, 2500)
  WHERE complete_research_project_price = 0 OR complete_research_project_price IS NULL;

-- Update pricing_config default
UPDATE public.pricing_config
  SET complete_research_project_price = 2500
  WHERE complete_research_project_price IS NULL OR complete_research_project_price = 0;
