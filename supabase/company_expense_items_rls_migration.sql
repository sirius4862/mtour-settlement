-- company_expense_items RLS — admin/staff only (guides must not read/write)
-- Run in Supabase SQL Editor if admin company expense save/select fails with permission errors.

ALTER TABLE public.company_expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_expense_items_admin_all ON public.company_expense_items;

CREATE POLICY company_expense_items_admin_all
  ON public.company_expense_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );
