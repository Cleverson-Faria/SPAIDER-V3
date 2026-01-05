-- Roles de usuário
CREATE TYPE app_role AS ENUM ('admin', 'user', 'super_admin');

-- Níveis de característica
CREATE TYPE characteristic_level AS ENUM ('level_1', 'level_2', 'level_3');

-- ---- NEXT BLOCK ----

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Verificar se usuário é super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
END;
$function$;

-- Verificar se usuário tem determinada role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

-- Obter organização do usuário
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$function$;

-- Handler para novos usuários (adaptar para seu sistema de auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_email TEXT;
  email_domain TEXT;
  org_id UUID;
  is_first_user BOOLEAN;
BEGIN
  -- Get user email from auth.users (ADAPTAR PARA SEU SISTEMA)
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  
  -- Extract domain from email
  email_domain := split_part(user_email, '@', 2);
  
  -- Find organization by email domain
  SELECT organization_id INTO org_id
  FROM public.allowed_email_domains
  WHERE domain = email_domain AND is_active = true
  LIMIT 1;
  
  -- If no organization found, raise exception
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Email domain % is not allowed', email_domain;
  END IF;
  
  -- Check if this is the first user in the organization
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles WHERE organization_id = org_id)
  INTO is_first_user;
  
  -- Insert profile
  INSERT INTO public.profiles (id, organization_id, full_name, email)
  VALUES (NEW.id, org_id, NEW.raw_user_meta_data->>'full_name', user_email);
  
  -- Assign role (first user = admin, others = user)
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (NEW.id, org_id, CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'user'::app_role END);
  
  RETURN NEW;
END;
$function$;

-- ---- NEXT BLOCK ----

CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  spaider_logo_url text,
  primary_color text DEFAULT '#6366f1',
  secondary_color text DEFAULT '#8b5cf6',
  ai_instructions text DEFAULT 'Você é um assistente de testes SAP. Ajude o usuário a testar ordens de vendas.',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY, -- FK para sua tabela de users
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  full_name text,
  email text NOT NULL,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL, -- FK para sua tabela de users
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_organization_id ON public.user_roles(organization_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.allowed_email_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  domain text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, domain)
);

CREATE INDEX idx_allowed_email_domains_domain ON public.allowed_email_domains(domain);

-- ---- NEXT BLOCK ----

CREATE TABLE public.sap_domain_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  domain text NOT NULL,
  display_name text NOT NULL,
  secret_suffix text NOT NULL, -- Ex: "L_MARKET" para SAP_API_URL_L_MARKET
  logo_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, domain)
);

CREATE TRIGGER update_sap_domain_credentials_updated_at
  BEFORE UPDATE ON public.sap_domain_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

CREATE TABLE public.characteristic_level_1 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, code)
);

-- ---- NEXT BLOCK ----

CREATE TABLE public.characteristic_level_2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, code)
);

-- ---- NEXT BLOCK ----

CREATE TABLE public.characteristic_level_3 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(organization_id, code)
);

-- ---- NEXT BLOCK ----

CREATE TABLE public.reference_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_number text NOT NULL,
  description text,
  order_type text NOT NULL DEFAULT 'venda_normal',
  domain text, -- Domínio SAP associado
  sap_doc_type text,
  warehouse_code text,
  
  -- Características (foreign keys)
  characteristic_1_id uuid REFERENCES public.characteristic_level_1(id),
  characteristic_2_id uuid REFERENCES public.characteristic_level_2(id),
  characteristic_3_id uuid REFERENCES public.characteristic_level_3(id),
  
  -- Referências para comparação de NF-e
  contract_reference text,
  quotation_reference text,
  delivery_reference text,
  invoice_reference text, -- Documento de faturamento para buscar NF-e
  docnum_reference text,
  
  -- Flags de suporte
  supports_contract boolean DEFAULT false,
  supports_quotation boolean DEFAULT false,
  supports_sales_order boolean DEFAULT true,
  supports_delivery boolean DEFAULT false,
  supports_invoice boolean DEFAULT false,
  supports_fiscal_note boolean DEFAULT false,
  
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_reference_orders_org ON public.reference_orders(organization_id);
CREATE INDEX idx_reference_orders_domain ON public.reference_orders(domain);
CREATE INDEX idx_reference_orders_order_number ON public.reference_orders(order_number);

-- ---- NEXT BLOCK ----

CREATE TABLE public.chat_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  thread_id text NOT NULL, -- ID do thread OpenAI
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_threads_user_id ON public.chat_threads(user_id);

CREATE TRIGGER update_chat_threads_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_flow_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id text NOT NULL,
  test_id text NOT NULL,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id text NOT NULL,
  original_order_id text,
  sap_domain text,
  test_type text DEFAULT 'fluxo_completo',
  
  -- Status global
  global_status text,
  total_steps integer DEFAULT 6,
  completed_steps integer DEFAULT 0,
  failed_steps integer DEFAULT 0,
  errors jsonb,
  
  -- Ordem
  order_data jsonb,
  order_status text DEFAULT 'completed',
  order_enabled boolean DEFAULT true,
  
  -- Remessa
  delivery_id text,
  delivery_data jsonb,
  delivery_status text,
  delivery_enabled boolean DEFAULT false,
  
  -- Picking
  picking_status text,
  
  -- PGI
  pgi_status text,
  
  -- Faturamento
  billing_id text,
  billing_data jsonb,
  billing_status text,
  billing_enabled boolean DEFAULT false,
  
  -- NF-e
  nfe_number text,
  nfe_data jsonb,
  nfe_reference_data jsonb,
  nfe_status text,
  nfe_enabled boolean DEFAULT false,
  nfe_differences integer DEFAULT 0,
  nfe_comparison_summary jsonb,
  
  -- Comparação de ordem
  raw_comparison_data jsonb,
  total_differences integer DEFAULT 0,
  sections_with_differences text[],
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_flow_executions_user ON public.test_flow_executions(user_id);
CREATE INDEX idx_test_flow_executions_org ON public.test_flow_executions(organization_id);
CREATE INDEX idx_test_flow_executions_run_id ON public.test_flow_executions(run_id);

CREATE TRIGGER update_test_flow_executions_updated_at
  BEFORE UPDATE ON public.test_flow_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_header_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_path text,
  original_value text,
  new_value text,
  is_identical boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_header_comparisons_execution ON public.test_header_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_item_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  item_number text NOT NULL,
  item_position integer,
  field_name text NOT NULL,
  field_path text,
  original_value text,
  new_value text,
  is_identical boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_item_comparisons_execution ON public.test_item_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_tax_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  item_number text NOT NULL,
  tax_type text NOT NULL,
  original_rate text,
  original_base text,
  original_base_value text,
  original_amount text,
  new_rate text,
  new_base text,
  new_base_value text,
  new_amount text,
  has_differences boolean NOT NULL,
  differences_list text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_tax_comparisons_execution ON public.test_tax_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_nfe_header_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_path text,
  original_value text,
  new_value text,
  is_identical boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_nfe_header_comparisons_execution ON public.test_nfe_header_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_nfe_item_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  item_number text NOT NULL,
  item_position integer,
  field_name text NOT NULL,
  field_path text,
  original_value text,
  new_value text,
  is_identical boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_nfe_item_comparisons_execution ON public.test_nfe_item_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.test_nfe_tax_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id) ON DELETE CASCADE,
  item_number text NOT NULL,
  tax_type text NOT NULL,
  original_rate text,
  original_base text,
  original_base_value text,
  original_amount text,
  new_rate text,
  new_base text,
  new_base_value text,
  new_amount text,
  has_differences boolean NOT NULL,
  differences_list text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_test_nfe_tax_comparisons_execution ON public.test_nfe_tax_comparisons(test_execution_id);

-- ---- NEXT BLOCK ----

CREATE TABLE public.nfe_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id uuid NOT NULL REFERENCES public.test_flow_executions(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  billing_document text NOT NULL,
  nfe_number text NOT NULL,
  status text NOT NULL DEFAULT 'fetched',
  nfe_header_data jsonb NOT NULL,
  nfe_items_data jsonb,
  nfe_tax_data jsonb,
  fetched_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_nfe_documents_execution ON public.nfe_documents(test_execution_id);
CREATE INDEX idx_nfe_documents_org ON public.nfe_documents(organization_id);

CREATE TRIGGER update_nfe_documents_updated_at
  BEFORE UPDATE ON public.nfe_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---- NEXT BLOCK ----

-- Criar organização padrão
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sua Empresa', 'sua-empresa');

-- Permitir domínio de email
INSERT INTO public.allowed_email_domains (organization_id, domain)
VALUES ('00000000-0000-0000-0000-000000000001', 'suaempresa.com.br');

-- Criar características padrão
INSERT INTO public.characteristic_level_1 (organization_id, code, name) VALUES
('00000000-0000-0000-0000-000000000001', 'VENDA_NORMAL', 'Venda Normal'),
('00000000-0000-0000-0000-000000000001', 'VENDA_BONIFICACAO', 'Venda Bonificação'),
('00000000-0000-0000-0000-000000000001', 'DEVOLUCAO', 'Devolução');
