/* Local copies of the prototype materials catalog. */

INSERT INTO public.Resources (
  Resource_Category_Id, Title, Description, Format, Mime_Type,
  Owner_Department_Id, Blob_Name, Status
)
SELECT category.Resource_Category_Id, source.Title, source.Description, source.Format,
  source.Mime_Type, department.Department_Id, source.Blob_Name, 'published'
FROM (VALUES
  ('Guia de benefícios', 'benefits', 'Conheça seus benefícios, critérios de elegibilidade e canais de atendimento.', 'PDF', 'application/pdf', 'Pessoas & Cultura', 'materiais/guia-beneficios.pdf'),
  ('Políticas da empresa', 'policies', 'Consulte as principais diretrizes e os acordos que orientam nosso dia a dia.', 'Documento', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Pessoas & Cultura', 'materiais/politicas-da-empresa.docx'),
  ('Acessos e ferramentas', 'tools', 'Veja quais ferramentas usamos e como começar a acessar cada uma delas.', 'Checklist', 'application/pdf', 'Tecnologia', 'materiais/acessos-e-ferramentas.pdf'),
  ('Manual do novo talento', 'onboarding', 'Um guia prático para conhecer a empresa e se organizar nos primeiros dias.', 'PDF', 'application/pdf', 'Pessoas & Cultura', 'materiais/manual-novo-talento.pdf'),
  ('Política de trabalho remoto', 'policies', 'Entenda os combinados para trabalhar de forma remota ou híbrida.', 'PDF', 'application/pdf', 'Pessoas & Cultura', 'materiais/politica-trabalho-remoto.pdf'),
  ('Guia de reembolso', 'finance', 'Confira quais despesas podem ser reembolsadas e como enviar uma solicitação.', 'PDF', 'application/pdf', 'Financeiro', 'materiais/guia-reembolso.pdf'),
  ('Código de conduta', 'culture', 'Conheça os princípios de respeito, ética e colaboração que compartilhamos.', 'PDF', 'application/pdf', 'Pessoas & Cultura', 'materiais/codigo-conduta.pdf'),
  ('Agenda da primeira semana', 'onboarding', 'Veja os principais encontros e atividades planejados para sua primeira semana.', 'Agenda', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Pessoas & Cultura', 'materiais/agenda-primeira-semana.xlsx')
) AS source(Title, Category_Slug, Description, Format, Mime_Type, Department_Name, Blob_Name)
INNER JOIN public.Resource_Categories AS category ON category.Slug = source.Category_Slug
LEFT JOIN public.Departments AS department ON department.Name = source.Department_Name
WHERE NOT EXISTS (
  SELECT 1 FROM public.Resources AS existing WHERE existing.Title = source.Title
);
