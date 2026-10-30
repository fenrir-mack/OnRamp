import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../components/shared";
import EmployeeAvatar from "../components/EmployeeAvatar";

type Account = {
  id: number;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  departmentId?: number | null;
  departmentIds: number[];
  departments: string[];
  teamIds: number[];
  teams: string[];
  managerEmployeeId?: number | null;
  managerName?: string | null;
  isActive: boolean;
  planTaskCount: number;
};

type Department = { id: number; name: string; description?: string | null; memberCount?: number };
type Team = { id: number; name: string; description: string | null; parentTeamId: number | null; parentTeamName: string | null; memberIds: number[]; memberCount: number; leaderIds: number[]; leaders: string[] };
type ResponsiblePerson = { id: number; name: string; jobTitle: string | null; department: string | null };

type Resource = {
  id: number;
  title: string;
  description: string | null;
  format: string;
  category: string;
  category_slug?: string;
  owner_employee_id?: number | null;
  external_url?: string | null;
  download_url?: string | null;
};

type ResourceCategory = { id: number; slug: string; name: string };

type Stage = {
  id: number;
  code: string;
  name: string;
  duration_label: string | null;
  display_order?: number;
};

type PlanTask = {
  id: number | string;
  stageTemplateId: number;
  stageName: string;
  stageOrder: number;
  title: string;
  description: string;
  category: string;
  taskType: "task" | "preparation" | "training" | "checkin";
  ownerRole: string;
  ownerEmployeeId: number | null;
  ownerName?: string | null;
  dueOffsetDays: number;
  required: boolean;
};

type TaskPreset = { id: number; name: string; description: string; tasks: PlanTask[] };

type PlanResource = {
  stageTemplateId: number;
  stageName: string;
  resourceId: number;
  title: string;
  required: boolean;
};

type TaskDraft = {
  stageTemplateId: string;
  title: string;
  description: string;
  taskType: PlanTask["taskType"];
  ownerEmployeeId: string;
  dueOffsetDays: string;
  required: boolean;
};

function buildTeamTree(teams: Team[]) {
  const children = new Map<number | null, Team[]>();
  for (const team of teams) {
    const group = children.get(team.parentTeamId) ?? [];
    group.push(team);
    children.set(team.parentTeamId, group);
  }
  for (const group of children.values()) group.sort((left, right) => left.name.localeCompare(right.name));
  const rows: { team: Team; depth: number }[] = [];
  const visited = new Set<number>();
  function visit(parentId: number | null, depth: number) {
    for (const team of children.get(parentId) ?? []) {
      if (visited.has(team.id)) continue;
      visited.add(team.id);
      rows.push({ team, depth });
      visit(team.id, depth + 1);
    }
  }
  visit(null, 0);
  for (const team of teams) {
    if (!visited.has(team.id)) {
      visited.add(team.id);
      rows.push({ team, depth: 0 });
      visit(team.id, 1);
    }
  }
  return rows;
}

function getDescendantTeamIds(teams: Team[], teamId: number) {
  const excluded = new Set([teamId]);
  let changed = true;
  while (changed) {
    changed = false;
    teams.forEach((team) => {
      if (!excluded.has(team.id) && team.parentTeamId !== null && excluded.has(team.parentTeamId)) {
        excluded.add(team.id);
        changed = true;
      }
    });
  }
  return excluded;
}

const taskTypeLabels: Record<PlanTask["taskType"], string> = {
  task: "Tarefa",
  preparation: "Preparação",
  training: "Treinamento",
  checkin: "Check-in",
};

const emptyDraft: TaskDraft = {
  stageTemplateId: "",
  title: "",
  description: "",
  taskType: "task",
  ownerEmployeeId: "",
  dueOffsetDays: "0",
  required: true,
};

function HrPlansView({ section }: { section: "people" | "plans" }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [responsiblePeople, setResponsiblePeople] = useState<ResponsiblePerson[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [libraryResources, setLibraryResources] = useState<Resource[]>([]);
  const [resourceCategories, setResourceCategories] = useState<ResourceCategory[]>([]);
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceDraft, setResourceDraft] = useState({ title: "", description: "", categorySlug: "", sourceType: "file" as "file" | "link", externalUrl: "" });
  const [editingResourceId, setEditingResourceId] = useState<number | null>(null);
  const [uploadingResource, setUploadingResource] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [taskPresets, setTaskPresets] = useState<TaskPreset[]>([]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<number[]>([]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetTasks, setPresetTasks] = useState<PlanTask[]>([]);
  const [presetTaskDraft, setPresetTaskDraft] = useState<TaskDraft>(emptyDraft);
  const [creatingPreset, setCreatingPreset] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [excludedTaskIds, setExcludedTaskIds] = useState<Array<number | string>>([]);
  const [planResources, setPlanResources] = useState<PlanResource[]>([]);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ name: "", email: "", jobTitle: "", departmentIds: [] as number[], teamIds: [] as number[], managerEmployeeId: "", password: "" });
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleView, setPeopleView] = useState<"people" | "organization">("people");
  const [departmentDraft, setDepartmentDraft] = useState({ name: "", description: "" });
  const [teamDraft, setTeamDraft] = useState({ name: "", description: "", parentTeamId: "", memberIds: [] as number[], leaderIds: [] as number[] });
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editOrganizationDraft, setEditOrganizationDraft] = useState({ name: "", description: "" });
  const [editTeamDraft, setEditTeamDraft] = useState({ name: "", description: "", parentTeamId: "", memberIds: [] as number[], leaderIds: [] as number[] });
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [planSearch, setPlanSearch] = useState("");
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft);
  const [editingTaskId, setEditingTaskId] = useState<number | string | null>(null);
  const [taskResponsibleSearch, setTaskResponsibleSearch] = useState("");
  const [presetResponsibleSearch, setPresetResponsibleSearch] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/hr/accounts").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as contas.");
        return result as Account[];
      }),
      fetch("/api/stages").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as etapas.");
        return result as Stage[];
      }),
      fetch("/api/hr/departments").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as áreas.");
        return result as Department[];
      }),
      fetch("/api/hr/teams").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as equipes.");
        return result as Team[];
      }),
      fetch("/api/resources").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os materiais.");
        return result as Resource[];
      }),
      fetch("/api/hr/resource-categories").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as categorias.");
        return result as ResourceCategory[];
      }),
      fetch("/api/hr/task-presets").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os pacotes de tarefas.");
        return result as TaskPreset[];
      }),
      fetch("/api/hr/responsibles").then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as pessoas responsáveis.");
        return result as ResponsiblePerson[];
      }),
    ])
      .then(([accountRows, stageRows, departmentRows, teamRows, resourceRows, categoryRows, presetRows, responsibleRows]) => {
        setAccounts(accountRows);
        setResponsiblePeople(responsibleRows);
        setStages(stageRows);
        setDepartments(departmentRows);
        setTeams(teamRows);
        setLibraryResources(resourceRows);
        setResourceCategories(categoryRows);
        setTaskPresets(presetRows);
        setResourceDraft((current) => ({ ...current, categorySlug: current.categorySlug || categoryRows.find(({ slug }) => slug === "onboarding")?.slug || categoryRows[0]?.slug || "" }));
        setSelectedAccountId(null);
        setSelectedStageId(stageRows[0]?.id ?? null);
        setDraft((current) => ({ ...current, stageTemplateId: String(stageRows[0]?.id ?? "") }));
        setPresetTaskDraft((current) => ({ ...current, stageTemplateId: String(stageRows[0]?.id ?? "") }));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a página do RH."))
      .finally(() => setLoadingAccounts(false));
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setTasks([]);
      setExcludedTaskIds([]);
      setPlanResources([]);
      return;
    }
    const controller = new AbortController();
    setLoadingPlan(true);
    setError("");
    setNotice("");
    setEditingTaskId(null);
    setDraft((current) => ({ ...emptyDraft, stageTemplateId: current.stageTemplateId || String(selectedStageId ?? "") }));
    fetch(`/api/hr/accounts/${selectedAccountId}/plan`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar o padrão.");
        return result as { tasks: PlanTask[]; resources: PlanResource[] };
      })
      .then((result) => { setTasks(result.tasks); setExcludedTaskIds([]); setPlanResources(result.resources); })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o padrão.");
      })
      .finally(() => setLoadingPlan(false));
    return () => controller.abort();
  }, [selectedAccountId]);

  const selectedAccount = accounts.find(({ id }) => id === selectedAccountId) ?? null;
  const selectedStage = stages.find(({ id }) => id === selectedStageId) ?? null;
  const teamRows = useMemo(() => buildTeamTree(teams), [teams]);
  const stageTasks = useMemo(
    () => tasks.filter((task) => task.stageTemplateId === selectedStageId),
    [tasks, selectedStageId],
  );

  function resetDraft(stageId = selectedStageId) {
    setEditingTaskId(null);
    setDraft((current) => ({ ...emptyDraft, stageTemplateId: String(stageId ?? ""), ownerEmployeeId: current.ownerEmployeeId }));
  }

  function taskFromDraft(taskDraft: TaskDraft, id: number | string): PlanTask | null {
    const stage = stages.find(({ id: stageId }) => stageId === Number(taskDraft.stageTemplateId));
    const owner = responsiblePeople.find((person) => person.id === Number(taskDraft.ownerEmployeeId));
    if (!stage || !owner) return null;
    return {
      id, stageTemplateId: stage.id, stageName: stage.name,
      stageOrder: stage.display_order ?? stages.findIndex(({ id: stageId }) => stageId === stage.id),
      title: taskDraft.title.trim(), description: taskDraft.description.trim(),
      category: taskTypeLabels[taskDraft.taskType], taskType: taskDraft.taskType,
      ownerEmployeeId: Number(taskDraft.ownerEmployeeId),
      ownerRole: owner.name,
      ownerName: owner.name,
      dueOffsetDays: Number(taskDraft.dueOffsetDays),
      required: taskDraft.required,
    };
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const existingTask = tasks.find(({ id }) => id === editingTaskId);
    const task = taskFromDraft(draft, existingTask?.id ?? `draft-${Date.now()}`);
    if (!task) return;
    setTasks((current) => existingTask
      ? current.map((item) => item.id === existingTask.id ? task : item)
      : [...current, task]);
    setExcludedTaskIds((current) => current.filter((id) => id !== task.id));
    setSelectedStageId(task.stageTemplateId);
    resetDraft(task.stageTemplateId);
    setNotice(`${existingTask ? "Tarefa atualizada" : "Tarefa adicionada"}. Salve a jornada para gravar no banco.`);
    setError("");
  }

  function addPresetTask() {
    if (!presetTaskDraft.title.trim()) {
      setError("Escreva o título da tarefa antes de adicioná-la ao pacote.");
      return;
    }
    if (!presetTaskDraft.ownerEmployeeId) {
      setError("Selecione a pessoa responsável pela tarefa.");
      return;
    }
    const task = taskFromDraft(presetTaskDraft, `preset-draft-${Date.now()}`);
    if (!task) return;
    setPresetTasks((current) => [...current, task]);
    setPresetTaskDraft((current) => ({ ...current, title: "", description: "" }));
    setError("");
  }

  async function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!presetTasks.length) {
      setError("Adicione pelo menos uma tarefa ao pacote.");
      return;
    }
    setCreatingPreset(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/hr/task-presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName, description: presetDescription, tasks: presetTasks }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o pacote.");
      const refreshed = await fetch("/api/hr/task-presets");
      const rows = await refreshed.json();
      if (!refreshed.ok) throw new Error(rows.error ?? "O pacote foi salvo, mas não foi possível atualizar a lista.");
      setTaskPresets(rows as TaskPreset[]);
      setPresetName("");
      setPresetDescription("");
      setPresetTasks([]);
      setShowPresetForm(false);
      setNotice(`Pacote “${result.name}” salvo para reutilização.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o pacote.");
    } finally {
      setCreatingPreset(false);
    }
  }

  function togglePreset(presetId: number, checked: boolean) {
    setSelectedPresetIds((current) => checked
      ? [...new Set([...current, presetId])]
      : current.filter((id) => id !== presetId));
  }

  function applySelectedPresets() {
    if (!selectedPresetIds.length) return;
    const selectedPresets = taskPresets.filter((preset) => selectedPresetIds.includes(preset.id));
    const additions = selectedPresets.flatMap((preset) => preset.tasks.map((task) => ({
      ...task,
      id: `preset-${preset.id}-${task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    })));
    const taskKey = (task: PlanTask) => `${task.stageTemplateId}:${task.title.trim().toLocaleLowerCase("pt-BR")}`;
    const existingKeys = new Set(tasks.map(taskKey));
    const uniqueAdditions = additions.filter((task) => {
      const key = taskKey(task);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    setTasks((current) => [...current, ...uniqueAdditions]);
    setExcludedTaskIds((current) => current.filter((id) => !uniqueAdditions.some((task) => task.id === id)));
    setSelectedPresetIds([]);
    if (uniqueAdditions.length) {
      setSelectedStageId(uniqueAdditions[0].stageTemplateId);
      resetDraft(uniqueAdditions[0].stageTemplateId);
    }
    setNotice(uniqueAdditions.length
      ? `${uniqueAdditions.length} tarefa(s) adicionada(s). Você pode desmarcar ou remover tarefas antes de salvar a jornada.`
      : "As tarefas dos pacotes já estão nesta jornada.");
    setError("");
  }

  function editTask(task: PlanTask) {
    setEditingTaskId(task.id);
    setSelectedStageId(task.stageTemplateId);
    setDraft({
      stageTemplateId: String(task.stageTemplateId),
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      ownerEmployeeId: String(task.ownerEmployeeId ?? responsiblePeople.find((person) => person.name === task.ownerRole)?.id ?? ""),
      dueOffsetDays: String(task.dueOffsetDays),
      required: task.required,
    });
    setNotice("");
  }

  function removeTask(taskId: number | string) {
    setTasks((current) => current.filter(({ id }) => id !== taskId));
    setExcludedTaskIds((current) => current.filter((id) => id !== taskId));
    if (editingTaskId === taskId) resetDraft();
    setNotice("Tarefa removida da lista. Salve o padrão para gravar no banco.");
  }

  function toggleResource(resource: Resource, isSelected: boolean) {
    if (!selectedStage) return;
    setPlanResources((current) => {
      const withoutResource = current.filter((item) => !(item.stageTemplateId === selectedStage.id && item.resourceId === resource.id));
      return isSelected
        ? [...withoutResource, { stageTemplateId: selectedStage.id, stageName: selectedStage.name, resourceId: resource.id, title: resource.title, required: false }]
        : withoutResource;
    });
    setNotice("Material atualizado na lista. Salve o padrão para gravar no banco.");
  }

  function editResource(resource: Resource) {
    setEditingResourceId(resource.id);
    setResourceFile(null);
    setResourceDraft({
      title: resource.title,
      description: resource.description ?? "",
      categorySlug: resource.category_slug ?? resourceCategories.find(({ name }) => name === resource.category)?.slug ?? "",
      sourceType: resource.external_url ? "link" : "file",
      externalUrl: resource.external_url ?? "",
    });
    setError("");
    setNotice("");
    const input = document.getElementById("hr-resource-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function resetResourceDraft() {
    setEditingResourceId(null);
    setResourceFile(null);
    setResourceDraft({ title: "", description: "", categorySlug: resourceCategories.find(({ slug }) => slug === "onboarding")?.slug ?? resourceCategories[0]?.slug ?? "", sourceType: "file", externalUrl: "" });
    const input = document.getElementById("hr-resource-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function saveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editedResource = libraryResources.find(({ id }) => id === editingResourceId);
    if (!selectedStage || (resourceDraft.sourceType === "file" && !resourceFile && (!editingResourceId || editedResource?.external_url))) {
      setError(resourceDraft.sourceType === "file" ? "Escolha um arquivo e uma etapa antes de salvar." : "Selecione uma etapa antes de salvar.");
      return;
    }
    if (resourceDraft.sourceType === "link" && !resourceDraft.externalUrl.trim()) {
      setError("Informe o link do material.");
      return;
    }
    const mimeFallbacks: Record<string, string> = {
      pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain", csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    };
    const extension = resourceFile?.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = resourceFile ? resourceFile.type || mimeFallbacks[extension] || "application/octet-stream" : "application/octet-stream";
    setUploadingResource(true);
    setError("");
    setNotice("");
    try {
      const metadata = {
        title: resourceDraft.title,
        description: resourceDraft.description,
        categorySlug: resourceDraft.categorySlug,
        sourceType: resourceDraft.sourceType,
        externalUrl: resourceDraft.sourceType === "link" ? resourceDraft.externalUrl.trim() : "",
      };
      const headersForFile = (file: File) => ({
        "Content-Type": "application/octet-stream",
        "X-Resource-Title": encodeURIComponent(resourceDraft.title),
        "X-Resource-Description": encodeURIComponent(resourceDraft.description),
        "X-Resource-Category": encodeURIComponent(resourceDraft.categorySlug),
        "X-File-Name": encodeURIComponent(file.name),
        "X-File-Type": mimeType,
      });
      let response: Response;
      if (editingResourceId && resourceDraft.sourceType === "file" && resourceFile) {
        response = await fetch(`/api/hr/resources/${editingResourceId}/file`, { method: "PUT", headers: headersForFile(resourceFile), body: resourceFile });
      } else if (editingResourceId) {
        response = await fetch(`/api/hr/resources/${editingResourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        });
      } else if (resourceDraft.sourceType === "link") {
        response = await fetch("/api/hr/resources/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        });
      } else {
        if (!resourceFile) throw new Error("Escolha um arquivo para o material.");
        response = await fetch("/api/hr/resources/upload", { method: "POST", headers: headersForFile(resourceFile), body: resourceFile });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o material.");
      const listResponse = await fetch("/api/resources");
      const refreshedResources = await listResponse.json();
      if (!listResponse.ok) throw new Error(refreshedResources.error ?? "Material salvo, mas não foi possível atualizar a biblioteca.");
      setLibraryResources(refreshedResources as Resource[]);
      const added = refreshedResources.find((item: Resource) => Number(item.id) === Number(result.id)) as Resource | undefined;
      if (added && !editingResourceId) {
        setPlanResources((current) => current.some((item) => item.stageTemplateId === selectedStage.id && item.resourceId === added.id)
          ? current
          : [...current, { stageTemplateId: selectedStage.id, stageName: selectedStage.name, resourceId: added.id, title: added.title, required: false }]);
      }
      if (editingResourceId) setPlanResources((current) => current.map((item) => item.resourceId === editingResourceId ? { ...item, title: resourceDraft.title } : item));
      const wasEditing = editingResourceId !== null;
      const sourceLabel = resourceDraft.sourceType === "link" ? "Link" : "Arquivo";
      resetResourceDraft();
      setNotice(wasEditing ? "Material atualizado." : `${sourceLabel} cadastrado e associado à etapa ${selectedStage.name}. Salve a jornada para confirmar a associação.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível salvar o material.");
    } finally {
      setUploadingResource(false);
    }
  }

  function openAccountForm(account?: Account) {
    setError("");
    setNotice("");
    setEditingAccountId(account?.id ?? null);
    setShowAccountForm(true);
    setAccountDraft(account ? {
      name: account.name,
      email: account.email,
      jobTitle: account.jobTitle ?? "",
      departmentIds: account.departmentIds ?? (account.departmentId ? [account.departmentId] : []),
      teamIds: account.teamIds ?? [],
      managerEmployeeId: String(account.managerEmployeeId ?? ""),
      password: "",
    } : { name: "", email: "", jobTitle: "", departmentIds: [], teamIds: [], managerEmployeeId: "", password: "" });
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingAccount(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editingAccountId ? `/api/hr/accounts/${editingAccountId}` : "/api/hr/accounts", {
        method: editingAccountId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingAccountId
          ? { name: accountDraft.name, email: accountDraft.email, jobTitle: accountDraft.jobTitle, departmentIds: accountDraft.departmentIds, teamIds: accountDraft.teamIds, managerEmployeeId: accountDraft.managerEmployeeId, isActive: accounts.find(({ id }) => id === editingAccountId)?.isActive ?? true }
          : accountDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar a conta.");
      const refreshedResponse = await fetch("/api/hr/accounts");
      const refreshedAccounts = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshedAccounts.error ?? "Conta salva, mas não foi possível atualizar a lista.");
      setAccounts(refreshedAccounts as Account[]);
      const account = (refreshedAccounts as Account[]).find(({ id }) => id === result.id);
      if (!editingAccountId && account?.isActive) setSelectedAccountId(account.id);
      setAccountDraft({ name: "", email: "", jobTitle: "", departmentIds: [], teamIds: [], managerEmployeeId: "", password: "" });
      setEditingAccountId(null);
      setShowAccountForm(false);
      setNotice(editingAccountId ? `Dados de ${account?.name ?? "pessoa"} atualizados.` : `Conta criada para ${account?.name ?? "a pessoa"}. Agora você pode montar o onboarding dessa pessoa.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar a conta.");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function toggleAccountActive(account: Account) {
    try {
      const response = await fetch(`/api/hr/accounts/${account.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: account.name, email: account.email, jobTitle: account.jobTitle ?? "", departmentIds: account.departmentIds ?? (account.departmentId ? [account.departmentId] : []), teamIds: account.teamIds ?? [], managerEmployeeId: account.managerEmployeeId ?? "", isActive: !account.isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível alterar o status da conta.");
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, isActive: result.isActive } : item));
      if (account.isActive && selectedAccountId === account.id) setSelectedAccountId(accounts.find((item) => item.id !== account.id && item.isActive)?.id ?? null);
      setNotice(`Conta de ${account.name} ${result.isActive ? "reativada" : "desativada"}.`);
      setError("");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível alterar o status da conta.");
    }
  }

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingOrganization(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/hr/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(departmentDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar a área.");
      setDepartments((current) => [...current, result as Department].sort((left, right) => left.name.localeCompare(right.name)));
      setDepartmentDraft({ name: "", description: "" });
      setNotice(`Área ${result.name} criada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível criar a área.");
    } finally {
      setSavingOrganization(false);
    }
  }

  async function refreshTeams() {
    const response = await fetch("/api/hr/teams");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as equipes.");
    setTeams(result as Team[]);
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingOrganization(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/hr/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.error ?? "Não foi possível criar a equipe."}${result.diagnosticId ? ` (referência: ${result.diagnosticId})` : ""}`);
      await refreshTeams();
      setTeamDraft({ name: "", description: "", parentTeamId: "", memberIds: [], leaderIds: [] });
      setNotice(`Equipe ${result.name} criada com pessoas e líderes associados.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível criar a equipe.");
    } finally {
      setSavingOrganization(false);
    }
  }

  async function updateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDepartmentId) return;
    const existing = departments.find(({ id }) => id === editingDepartmentId);
    if (!existing) return;
    setSavingOrganization(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/hr/departments/${editingDepartmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editOrganizationDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a área.");
      setDepartments((current) => current.map((item) => item.id === editingDepartmentId ? { ...item, ...result } : item).sort((left, right) => left.name.localeCompare(right.name)));
      setAccounts((current) => current.map((account) => {
        const departmentsForPerson = account.departments.map((name) => name === existing.name ? result.name : name);
        return { ...account, departments: departmentsForPerson, department: departmentsForPerson.join(", ") || null };
      }));
      setEditingDepartmentId(null);
      setNotice(`Área ${result.name} atualizada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar a área.");
    } finally {
      setSavingOrganization(false);
    }
  }

  async function updateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTeamId) return;
    const existing = teams.find(({ id }) => id === editingTeamId);
    if (!existing) return;
    setSavingOrganization(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/hr/teams/${editingTeamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editTeamDraft, parentTeamId: editTeamDraft.parentTeamId || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.error ?? "Não foi possível atualizar a equipe."}${result.diagnosticId ? ` (referência: ${result.diagnosticId})` : ""}`);
      await refreshTeams();
      setAccounts((current) => current.map((account) => ({ ...account, teams: account.teams.map((name) => name === existing.name ? result.name : name) })));
      setEditingTeamId(null);
      setNotice(`Equipe ${result.name} atualizada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar a equipe.");
    } finally {
      setSavingOrganization(false);
    }
  }

  function toggleTeamDraftMember(employeeId: number, editing: boolean) {
    const update = (current: typeof teamDraft) => {
      const isSelected = current.memberIds.includes(employeeId);
      return {
        ...current,
        memberIds: isSelected ? current.memberIds.filter((id) => id !== employeeId) : [...current.memberIds, employeeId],
        leaderIds: isSelected ? current.leaderIds.filter((id) => id !== employeeId) : current.leaderIds,
      };
    };
    if (editing) setEditTeamDraft((current) => update(current));
    else setTeamDraft((current) => update(current));
  }

  function toggleTeamDraftLeader(employeeId: number, editing: boolean) {
    const update = (current: typeof teamDraft) => {
      const isLeader = current.leaderIds.includes(employeeId);
      return {
        ...current,
        memberIds: isLeader || current.memberIds.includes(employeeId) ? current.memberIds : [...current.memberIds, employeeId],
        leaderIds: isLeader ? current.leaderIds.filter((id) => id !== employeeId) : [...current.leaderIds, employeeId],
      };
    };
    if (editing) setEditTeamDraft((current) => update(current));
    else setTeamDraft((current) => update(current));
  }

  function toggleDepartmentSelection(departmentId: number) {
    setAccountDraft((current) => ({
      ...current,
      departmentIds: current.departmentIds.includes(departmentId)
        ? current.departmentIds.filter((id) => id !== departmentId)
        : [...current.departmentIds, departmentId],
    }));
  }

  function toggleTeamSelection(teamId: number) {
    setAccountDraft((current) => ({
      ...current,
      teamIds: current.teamIds.includes(teamId)
        ? current.teamIds.filter((id) => id !== teamId)
        : [...current.teamIds, teamId],
    }));
  }

  const filteredPeople = accounts.filter((account) => `${account.name} ${account.email} ${account.jobTitle ?? ""} ${account.departments.join(" ")} ${account.teams.join(" ")} ${account.managerName ?? ""}`.toLocaleLowerCase("pt-BR").includes(peopleSearch.toLocaleLowerCase("pt-BR")));
  const activeAccounts = accounts.filter((account) => account.isActive);
  function responsibleMatches(search: string) {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return [];
    return responsiblePeople.filter((person) => person.name.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 3);
  }
  const planMatches = planSearch.trim()
    ? activeAccounts.filter((account) => account.name.toLocaleLowerCase("pt-BR").includes(planSearch.trim().toLocaleLowerCase("pt-BR"))).slice(0, 3)
    : [];

  async function savePlan() {
    if (!selectedAccountId) return;
    const includedTasks = tasks.filter((task) => !excludedTaskIds.includes(task.id));
    if (includedTasks.some((task) => !task.ownerEmployeeId)) {
      setError("Escolha uma pessoa responsável para cada tarefa incluída. Use Editar na tarefa sem responsável.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/hr/accounts/${selectedAccountId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: includedTasks.map(({ stageTemplateId, title, description, category, taskType, ownerRole, ownerEmployeeId, dueOffsetDays, required }) => ({
            stageTemplateId, title, description, category, taskType, ownerRole, ownerEmployeeId, dueOffsetDays, required,
          })),
          resources: stages.map((stage) => ({
            stageTemplateId: stage.id,
            resourceIds: planResources.filter((item) => item.stageTemplateId === stage.id).map(({ resourceId }) => resourceId),
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o padrão.");
      setAccounts((current) => current.map((account) => account.id === selectedAccountId ? { ...account, planTaskCount: result.saved } : account));
      const refreshed = await fetch(`/api/hr/accounts/${selectedAccountId}/plan`);
      const refreshedPlan = await refreshed.json();
      if (refreshed.ok) {
        setTasks(refreshedPlan.tasks as PlanTask[]);
        setExcludedTaskIds([]);
        setPlanResources(refreshedPlan.resources as PlanResource[]);
      }
      setNotice(`Jornada de ${selectedAccount?.name ?? "esta conta"} salva no banco de dados.`);
      setEditingTaskId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o padrão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Área administrativa</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Espaço do RH</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#777a91]">Organize as pessoas da empresa e configure a jornada de onboarding de cada conta.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {section === "people" && peopleView === "people" && <button className="button-primary h-12 px-5" onClick={() => openAccountForm()} type="button"><Icon name="people" size={16} /> Novo usuário</button>}
        </div>
      </header>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{notice}</p>}

      {section === "people" && <div className="mt-6 flex gap-2 border-b border-[#e8e8f0] pb-3"><button className={`rounded-xl px-4 py-2.5 text-sm font-bold ${peopleView === "people" ? "bg-[#f0efff] text-[#5556d8]" : "text-[#777a91] hover:bg-white"}`} onClick={() => setPeopleView("people")} type="button">Pessoas</button><button className={`rounded-xl px-4 py-2.5 text-sm font-bold ${peopleView === "organization" ? "bg-[#f0efff] text-[#5556d8]" : "text-[#777a91] hover:bg-white"}`} onClick={() => { setPeopleView("organization"); setShowAccountForm(false); setEditingAccountId(null); }} type="button">Áreas e equipes</button></div>}

      {section === "people" && peopleView === "organization" && <div className="mt-6 space-y-6">
        <div className="grid gap-5 xl:grid-cols-2">
          <form className="content-panel space-y-4" onSubmit={createDepartment}>
            <div><p className="eyebrow">Estrutura organizacional</p><h2 className="mt-1 text-lg font-extrabold">Criar área</h2><p className="mt-1 text-sm text-[#85879a]">Uma pessoa pode participar de mais de uma área.</p></div>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Nome da área</span><input required maxLength={100} className="w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm" value={departmentDraft.name} onChange={(event) => setDepartmentDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Design" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Descrição</span><input maxLength={300} className="w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm" value={departmentDraft.description} onChange={(event) => setDepartmentDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Responsabilidades desta área" /></label>
            <button className="button-primary h-11 px-4" disabled={savingOrganization} type="submit">Criar área</button>
          </form>
          <form className="content-panel space-y-4" onSubmit={createTeam}>
            <div><p className="eyebrow">Grupos de trabalho</p><h2 className="mt-1 text-lg font-extrabold">Criar equipe</h2><p className="mt-1 text-sm text-[#85879a]">Equipes são independentes das áreas e podem reunir pessoas de áreas diferentes.</p></div>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Nome da equipe</span><input required maxLength={120} className="w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm" value={teamDraft.name} onChange={(event) => setTeamDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Plataforma" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Descrição</span><input maxLength={300} className="w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm" value={teamDraft.description} onChange={(event) => setTeamDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Objetivo ou foco da equipe" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Equipe superior (opcional)</span><select className="w-full rounded-xl border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={teamDraft.parentTeamId} onChange={(event) => setTeamDraft((current) => ({ ...current, parentTeamId: event.target.value }))}><option value="">Equipe principal</option>{teamRows.map(({ team, depth }) => <option key={team.id} value={team.id}>{`${"　".repeat(depth)}${depth ? "↳ " : ""}${team.name}`}</option>)}</select></label>
            <TeamPeoplePicker title="Pessoas da equipe" people={accounts.filter((person) => person.isActive)} selectedIds={teamDraft.memberIds} onToggle={(id) => toggleTeamDraftMember(id, false)} />
            <TeamPeoplePicker title="Líderes da equipe" people={accounts.filter((person) => person.isActive)} selectedIds={teamDraft.leaderIds} onToggle={(id) => toggleTeamDraftLeader(id, false)} helper="Marcar uma pessoa líder também a adiciona à equipe." />
            <button className="button-primary h-11 px-4" disabled={savingOrganization} type="submit">Criar equipe</button>
          </form>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="content-panel"><div><p className="eyebrow">Cadastro</p><h2 className="mt-1 text-lg font-extrabold">Áreas da empresa <span className="text-sm font-semibold text-[#85879a]">({departments.length})</span></h2></div>
            <div className="mt-4 space-y-3">{departments.map((department) => {
              const members = accounts.filter((account) => account.departmentIds.includes(department.id));
              return <article className="rounded-xl border border-[#ededf3] bg-white p-4" key={department.id}>
                {editingDepartmentId === department.id ? <form className="space-y-3" onSubmit={updateDepartment}><input required maxLength={100} aria-label="Nome da área" className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2 text-sm" value={editOrganizationDraft.name} onChange={(event) => setEditOrganizationDraft((current) => ({ ...current, name: event.target.value }))} /><input maxLength={300} aria-label="Descrição da área" className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2 text-sm" value={editOrganizationDraft.description} onChange={(event) => setEditOrganizationDraft((current) => ({ ...current, description: event.target.value }))} /><div className="flex gap-2"><button className="button-primary h-9 px-3 text-xs" disabled={savingOrganization} type="submit">Salvar</button><button className="rounded-lg border px-3 text-xs" onClick={() => setEditingDepartmentId(null)} type="button">Cancelar</button></div></form> : <><div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold text-[#303249]">{department.name}</h3><p className="mt-1 text-xs text-[#85879a]">{department.description || "Sem descrição"}</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#f3f3f8] px-2.5 py-1 text-[10px] font-bold text-[#777a91]">{members.length} {members.length === 1 ? "pessoa" : "pessoas"}</span><button className="text-xs font-bold text-[#5556d8]" onClick={() => { setEditingDepartmentId(department.id); setEditOrganizationDraft({ name: department.name, description: department.description ?? "" }); }} type="button">Editar</button></div></div><p className="mt-3 border-t border-[#eeeeF4] pt-3 text-xs text-[#777a91]">{members.length ? members.map(({ name }) => name).join(" · ") : "Ainda sem pessoas associadas."}</p></>}
              </article>;
            })}</div>
          </section>
          <section className="content-panel"><div><p className="eyebrow">Grupos de trabalho</p><h2 className="mt-1 text-lg font-extrabold">Equipes <span className="text-sm font-semibold text-[#85879a]">({teams.length})</span></h2></div>
            <div className="mt-4 space-y-3">{teamRows.map(({ team, depth }) => {
              const members = accounts.filter((account) => account.teamIds.includes(team.id));
              const invalidParentIds = getDescendantTeamIds(teams, team.id);
              return <article className="rounded-xl border border-[#ededf3] bg-white p-4" key={team.id} style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}>
                {editingTeamId === team.id ? <form className="space-y-3" onSubmit={updateTeam}>
                  <input required maxLength={120} aria-label="Nome da equipe" className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2 text-sm" value={editTeamDraft.name} onChange={(event) => setEditTeamDraft((current) => ({ ...current, name: event.target.value }))} />
                  <input maxLength={300} aria-label="Descrição da equipe" className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2 text-sm" value={editTeamDraft.description} onChange={(event) => setEditTeamDraft((current) => ({ ...current, description: event.target.value }))} />
                  <label className="block text-xs font-bold text-[#55576d]">Equipe superior<select className="mt-1.5 w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2 text-sm font-normal" value={editTeamDraft.parentTeamId} onChange={(event) => setEditTeamDraft((current) => ({ ...current, parentTeamId: event.target.value }))}><option value="">Equipe principal</option>{teamRows.filter(({ team: option }) => !invalidParentIds.has(option.id)).map(({ team: option, depth: optionDepth }) => <option key={option.id} value={option.id}>{`${"　".repeat(optionDepth)}${optionDepth ? "↳ " : ""}${option.name}`}</option>)}</select></label>
                  <TeamPeoplePicker title="Pessoas da equipe" people={accounts.filter((person) => person.isActive)} selectedIds={editTeamDraft.memberIds} onToggle={(id) => toggleTeamDraftMember(id, true)} />
                  <TeamPeoplePicker title="Líderes da equipe" people={accounts.filter((person) => person.isActive)} selectedIds={editTeamDraft.leaderIds} onToggle={(id) => toggleTeamDraftLeader(id, true)} helper="Marcar uma pessoa líder também a adiciona à equipe." />
                  <div className="flex gap-2"><button className="button-primary h-9 px-3 text-xs" disabled={savingOrganization} type="submit">Salvar</button><button className="rounded-lg border px-3 text-xs" onClick={() => setEditingTeamId(null)} type="button">Cancelar</button></div>
                </form> : <><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#303249]">{team.name}</h3>{team.parentTeamName && <span className="rounded-full bg-[#f3f3f8] px-2 py-1 text-[10px] font-semibold text-[#777a91]">Subequipe de {team.parentTeamName}</span>}</div><p className="mt-1 text-xs text-[#85879a]">{team.description || "Sem descrição"}</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#f3f3f8] px-2.5 py-1 text-[10px] font-bold text-[#777a91]">{members.length} {members.length === 1 ? "pessoa" : "pessoas"}</span><button className="text-xs font-bold text-[#5556d8]" onClick={() => { setEditingTeamId(team.id); setEditTeamDraft({ name: team.name, description: team.description ?? "", parentTeamId: String(team.parentTeamId ?? ""), memberIds: team.memberIds, leaderIds: team.leaderIds }); }} type="button">Editar</button></div></div>
                  {team.leaders.length > 0 && <p className="mt-3 text-xs text-[#777a91]">Líderes: <strong className="text-[#45475d]">{team.leaders.join(" · ")}</strong></p>}
                  <div className="mt-3 border-t border-[#eeeeF4] pt-3">{members.length ? <div className="flex flex-wrap gap-2">{members.map((person) => <span className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[10px] font-semibold ${team.leaderIds.includes(person.id) ? "bg-[#eeedff] text-[#5556d8]" : "bg-[#f5f5f9] text-[#66687d]"}`} key={person.id}>{team.leaderIds.includes(person.id) && "★"}<EmployeeAvatar employeeId={person.id} name={person.name} className="grid size-7 place-items-center rounded-full bg-[#e9e8ff] text-[9px] font-extrabold text-[#5859d6]" />{person.name} · {person.departments.join(", ") || "Sem área"}</span>)}</div> : <p className="text-xs text-[#777a91]">Ainda sem pessoas associadas.</p>}</div></>}
              </article>;
            })}</div>
          </section>
        </div>
      </div>}

      {section === "people" && peopleView === "people" && showAccountForm && <form className="content-panel mt-6" onSubmit={saveAccount}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{editingAccountId ? "Editar pessoa" : "Nova pessoa"}</p><h2 className="mt-1 text-lg font-extrabold">{editingAccountId ? "Dados da conta" : "Criar conta de acesso"}</h2></div><button className="text-sm font-bold text-[#85879a]" onClick={() => { setShowAccountForm(false); setEditingAccountId(null); }} type="button">Fechar</button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label><span className="mb-2 block text-xs font-bold text-[#55576d]">Nome completo</span><input required maxLength={160} className="w-full rounded-xl border border-[#e3e3ed] px-3 py-3 text-sm" value={accountDraft.name} onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span className="mb-2 block text-xs font-bold text-[#55576d]">E-mail</span><input required type="email" maxLength={254} className="w-full rounded-xl border border-[#e3e3ed] px-3 py-3 text-sm" value={accountDraft.email} onChange={(event) => setAccountDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label><span className="mb-2 block text-xs font-bold text-[#55576d]">Cargo</span><input maxLength={120} className="w-full rounded-xl border border-[#e3e3ed] px-3 py-3 text-sm" value={accountDraft.jobTitle} onChange={(event) => setAccountDraft((current) => ({ ...current, jobTitle: event.target.value }))} /></label>
          <label><span className="mb-2 block text-xs font-bold text-[#55576d]">Liderança direta</span><select className="w-full rounded-xl border border-[#e3e3ed] bg-white px-3 py-3 text-sm" value={accountDraft.managerEmployeeId} onChange={(event) => setAccountDraft((current) => ({ ...current, managerEmployeeId: event.target.value }))}><option value="">Sem liderança definida</option>{accounts.filter((person) => person.isActive && person.id !== editingAccountId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <fieldset className="rounded-xl border border-[#e3e3ed] p-4"><legend className="px-1 text-xs font-bold text-[#55576d]">Áreas</legend><p className="mb-3 text-[11px] text-[#85879a]">Selecione todas as áreas desta pessoa.</p><div className="max-h-44 space-y-2 overflow-y-auto">{departments.map((department) => <label className="flex items-center gap-2 text-sm text-[#45475d]" key={department.id}><input className="size-4 accent-[#5b5ce2]" type="checkbox" checked={accountDraft.departmentIds.includes(department.id)} onChange={() => toggleDepartmentSelection(department.id)} />{department.name}</label>)}</div>{!departments.length && <button className="text-xs font-bold text-[#5556d8]" onClick={() => { setPeopleView("organization"); setShowAccountForm(false); }} type="button">Crie uma área primeiro</button>}</fieldset>
          <fieldset className="rounded-xl border border-[#e3e3ed] p-4"><legend className="px-1 text-xs font-bold text-[#55576d]">Equipes</legend><p className="mb-3 text-[11px] text-[#85879a]">Uma equipe pode juntar pessoas de várias áreas. Sub-equipes aparecem indentadas.</p><div className="max-h-44 space-y-2 overflow-y-auto">{teamRows.map(({ team, depth }) => <label className="flex items-center gap-2 text-sm text-[#45475d]" key={team.id}><input className="size-4 accent-[#5b5ce2]" type="checkbox" checked={accountDraft.teamIds.includes(team.id)} onChange={() => toggleTeamSelection(team.id)} /><span>{`${"　".repeat(depth)}${depth ? "↳ " : ""}${team.name}`}</span></label>)}</div>{!teams.length && <button className="text-xs font-bold text-[#5556d8]" onClick={() => { setPeopleView("organization"); setShowAccountForm(false); }} type="button">Crie uma equipe primeiro</button>}</fieldset>
          {!editingAccountId && <label><span className="mb-2 block text-xs font-bold text-[#55576d]">Senha inicial</span><input required minLength={8} type="password" autoComplete="new-password" className="w-full rounded-xl border border-[#e3e3ed] px-3 py-3 text-sm" value={accountDraft.password} onChange={(event) => setAccountDraft((current) => ({ ...current, password: event.target.value }))} /><small className="mt-1 block text-[10px] text-[#85879a]">Mínimo de 8 caracteres.</small></label>}
          <div className="flex items-end"><button className="button-primary h-12 w-full" disabled={creatingAccount} type="submit">{creatingAccount ? "Salvando..." : editingAccountId ? "Salvar alterações" : "Criar usuário"}</button></div>
        </div>
      </form>}

      {section === "people" && peopleView === "people" && <div className="content-panel mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Diretório</p><h2 className="mt-1 text-xl font-extrabold">Pessoas da empresa</h2><p className="mt-1 text-sm text-[#85879a]">{accounts.length} contas cadastradas · {activeAccounts.length} ativas</p></div><input aria-label="Buscar pessoa" className="w-full max-w-sm rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm" placeholder="Buscar por nome, e-mail, cargo ou área" value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} /></div>
        {loadingAccounts ? <p className="mt-6 text-sm text-[#85879a]">Carregando pessoas...</p> : filteredPeople.length ? <div className="mt-5 divide-y divide-[#eeeeF4]">{filteredPeople.map((person) => <article className="flex flex-wrap items-center gap-3 py-4" key={person.id}><EmployeeAvatar employeeId={person.id} name={person.name} className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1f0ff] text-sm font-extrabold text-[#5b5ce2]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#303249]">{person.name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${person.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#f2f2f5] text-[#85879a]"}`}>{person.isActive ? "Ativa" : "Inativa"}</span></div><p className="mt-1 text-xs text-[#777a91]">{person.email} · {person.jobTitle ?? "Cargo não informado"}</p><p className="mt-1 text-xs text-[#85879a]">Áreas: {person.departments.length ? person.departments.join(" · ") : "Sem área"} · Equipes: {person.teams.length ? person.teams.join(" · ") : "Sem equipe"}{person.managerName ? ` · Liderança: ${person.managerName}` : " · Sem liderança"}</p></div><button className="rounded-lg border border-[#e6e6ef] px-3 py-2 text-xs font-bold text-[#5b5ce2]" onClick={() => openAccountForm(person)} type="button">Editar</button><button className={`rounded-lg border px-3 py-2 text-xs font-bold ${person.isActive ? "border-[#f1dada] text-[#b84f4f]" : "border-emerald-200 text-emerald-700"}`} onClick={() => void toggleAccountActive(person)} type="button">{person.isActive ? "Desativar" : "Reativar"}</button></article>)}</div> : <p className="mt-6 text-sm text-[#85879a]">Nenhuma pessoa corresponde à busca.</p>}
      </div>}

      {section === "plans" && <div className="mt-7 pb-24">
        <div className="content-panel">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Jornadas individuais</p><h2 className="mt-1 text-xl font-extrabold">Encontre uma pessoa</h2><p className="mt-1 text-sm text-[#85879a]">Pesquise pelo nome para configurar a jornada de cada pessoa.</p></div><span className="rounded-full bg-[#f0efff] px-3 py-1 text-xs font-extrabold text-[#5556d8]">{activeAccounts.length} contas ativas</span></div>
          <input aria-label="Pesquisar conta pelo nome" className="mt-5 w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm outline-none focus:border-[#7778e5]" placeholder="Digite o nome da pessoa" value={planSearch} onChange={(event) => { setPlanSearch(event.target.value); setSelectedAccountId(null); }} />
          {loadingAccounts ? <p className="mt-4 text-sm text-[#85879a]">Carregando contas...</p> : planSearch.trim() ? planMatches.length ? <div className="mt-4 grid gap-3 md:grid-cols-3">{planMatches.map((account) => <button aria-pressed={selectedAccountId === account.id} className={`rounded-xl border p-4 text-left transition ${selectedAccountId === account.id ? "border-[#aaaaf0] bg-[#f4f3ff] ring-2 ring-[#e4e3ff]" : "border-[#ededf3] hover:border-[#c9c8ed] hover:bg-[#fafafe]"}`} key={account.id} onClick={() => setSelectedAccountId(account.id)} type="button"><span className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#5b5ce2] shadow-sm"><Icon name="user" size={18} /></span><span className="min-w-0"><strong className="block truncate text-sm text-[#303249]">{account.name}</strong><small className="mt-1 block truncate text-xs text-[#85879a]">{account.email}</small></span></span><span className="mt-3 block text-xs font-semibold text-[#777a91]">{account.jobTitle ?? "Cargo não informado"} · {account.department ?? "Sem área"}</span></button>)}</div> : <p className="mt-4 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Nenhuma conta ativa encontrada com esse nome.</p> : <p className="mt-4 text-sm text-[#85879a]">Os até três resultados aparecerão aqui enquanto você digita.</p>}
        </div>

        <section className="content-panel mt-5" aria-labelledby="task-presets-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="eyebrow">Reutilize tarefas</p><h2 id="task-presets-title" className="mt-1 text-xl font-extrabold">Pacotes prontos</h2><p className="mt-1 max-w-2xl text-sm text-[#85879a]">Marque um ou mais pacotes para incluir as tarefas na jornada. Depois você pode desmarcar ou remover cada tarefa.</p></div>
            <button className="rounded-xl border border-[#dedeea] bg-white px-4 py-3 text-sm font-extrabold text-[#5556d8]" onClick={() => { setShowPresetForm((show) => !show); setError(""); }} type="button">{showPresetForm ? "Fechar criação" : "+ Criar pacote"}</button>
          </div>

          {showPresetForm && <form className="mt-5 rounded-xl border border-[#e6e6ef] bg-[#fafafe] p-4" onSubmit={savePreset}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Novo pacote</p><h3 className="mt-1 font-extrabold">Monte uma lista reutilizável</h3></div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Nome do pacote</span><input required maxLength={120} className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" placeholder="Ex.: Contas de programador" value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Quando usar (opcional)</span><input maxLength={500} className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" placeholder="Ex.: Para pessoas que entram em desenvolvimento" value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} /></label>
            </div>
            <div className="mt-5 rounded-xl border border-[#e6e6ef] bg-white p-4">
              <p className="text-sm font-extrabold text-[#45475d]">Adicionar uma tarefa ao pacote</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Etapa</span><select required className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={presetTaskDraft.stageTemplateId} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, stageTemplateId: event.target.value }))}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Título da tarefa</span><input maxLength={180} className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2.5 text-sm" placeholder="Ex.: Criar conta de desenvolvimento" value={presetTaskDraft.title} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">O que a pessoa deve fazer?</span><textarea maxLength={1000} className="min-h-20 w-full rounded-lg border border-[#e3e3ed] px-3 py-2.5 text-sm" placeholder="Descreva o que precisa acontecer e como saber que foi concluído." value={presetTaskDraft.description} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Tipo / categoria</span><select className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={presetTaskDraft.taskType} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, taskType: event.target.value as PlanTask["taskType"] }))}>{Object.entries(taskTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <div className="relative"><label className="mb-1.5 block text-xs font-bold text-[#55576d]" htmlFor="preset-responsible-search">Pessoa responsável</label><input id="preset-responsible-search" className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" placeholder="Buscar pelo nome" value={presetResponsibleSearch} onChange={(event) => { setPresetResponsibleSearch(event.target.value); setPresetTaskDraft((current) => ({ ...current, ownerEmployeeId: "" })); }} />
                  {presetTaskDraft.ownerEmployeeId && (() => { const person = responsiblePeople.find(({ id }) => id === Number(presetTaskDraft.ownerEmployeeId)); return person ? <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#c9c8ed] bg-[#f7f6ff] px-3 py-2"><div className="min-w-0"><strong className="block truncate text-xs text-[#303249]">{person.name}</strong><small className="block truncate text-[10px] text-[#777a91]">{person.jobTitle ?? "Cargo não informado"} · {person.department ?? "Sem área"}</small></div><button className="shrink-0 text-[10px] font-bold text-[#5556d8]" onClick={() => setPresetTaskDraft((current) => ({ ...current, ownerEmployeeId: "" }))} type="button">Trocar</button></div> : null; })()}
                  {!presetTaskDraft.ownerEmployeeId && presetResponsibleSearch.trim() && <div className="absolute inset-x-0 top-full z-10 mt-1 space-y-1 rounded-xl border border-[#e5e5ef] bg-white p-2 shadow-lg">{responsibleMatches(presetResponsibleSearch).length ? responsibleMatches(presetResponsibleSearch).map((person) => <button className="w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-[#e5e4fa] hover:bg-[#f8f7ff]" key={person.id} onClick={() => { setPresetTaskDraft((current) => ({ ...current, ownerEmployeeId: String(person.id) })); setPresetResponsibleSearch(""); }} type="button"><strong className="block truncate text-xs text-[#303249]">{person.name}</strong><small className="mt-0.5 block truncate text-[10px] text-[#777a91]">{person.jobTitle ?? "Cargo não informado"} · {person.department ?? "Sem área"}</small></button>) : <p className="px-3 py-2 text-xs text-[#85879a]">Nenhuma pessoa encontrada.</p>}</div>}
                </div>
                <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Prazo após início (dias)</span><input min={0} max={32767} type="number" className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={presetTaskDraft.dueOffsetDays} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, dueOffsetDays: event.target.value }))} /></label>
                <label className="flex items-center gap-2 text-sm font-semibold text-[#55576d]"><input className="size-4 accent-[#5b5ce2]" type="checkbox" checked={presetTaskDraft.required} onChange={(event) => setPresetTaskDraft((current) => ({ ...current, required: event.target.checked }))} />Obrigatória por padrão</label>
              </div>
              <div className="mt-3 flex justify-end"><button className="rounded-lg border border-[#dedeea] px-4 py-2.5 text-sm font-bold text-[#5556d8]" onClick={addPresetTask} type="button">Adicionar tarefa ao pacote</button></div>
            </div>
            {presetTasks.length > 0 && <div className="mt-4 space-y-2">{presetTasks.map((task) => <article className="flex items-start justify-between gap-3 rounded-lg border border-[#ededf3] bg-white p-3" key={task.id}><div><strong className="text-sm text-[#303249]">{task.title}</strong><p className="mt-1 text-xs text-[#85879a]">{task.stageName} · {taskTypeLabels[task.taskType]} · {task.ownerName} · {task.description || "Sem descrição"}</p></div><button aria-label={`Tirar ${task.title} do pacote`} className="text-xs font-bold text-[#b84f4f]" onClick={() => setPresetTasks((current) => current.filter((item) => item.id !== task.id))} type="button">Tirar</button></article>)}</div>}
            <div className="mt-4 flex justify-end"><button className="button-primary h-11 px-5" disabled={creatingPreset || presetTasks.length === 0} type="submit">{creatingPreset ? "Salvando..." : `Salvar pacote (${presetTasks.length})`}</button></div>
          </form>}

          {taskPresets.length ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{taskPresets.map((preset) => <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selectedPresetIds.includes(preset.id) ? "border-[#b8b8f2] bg-[#f7f6ff]" : "border-[#ededf3] hover:bg-[#fafafe]"}`} key={preset.id}><input className="mt-1 size-4 accent-[#5b5ce2]" type="checkbox" checked={selectedPresetIds.includes(preset.id)} onChange={(event) => togglePreset(preset.id, event.target.checked)} /><span className="min-w-0"><strong className="block text-sm text-[#303249]">{preset.name}</strong><small className="mt-1 block text-xs text-[#85879a]">{preset.description || preset.tasks.length + (preset.tasks.length === 1 ? " tarefa" : " tarefas")}</small><span className="mt-2 flex flex-wrap gap-1">{Array.from(new Set(preset.tasks.map((task) => task.stageName))).map((stageName) => <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#777a91]" key={stageName}>{stageName}</span>)}</span></span></label>)}</div> : <p className="mt-5 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Ainda não há pacotes. Crie, por exemplo, “Contas da empresa” e “Contas de programador”.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#85879a]">{selectedPresetIds.length} pacotes marcados{!selectedAccount ? " · encontre uma pessoa acima para aplicá-los" : ""}</p><button className="button-primary h-11 px-5" disabled={!selectedAccount || !selectedPresetIds.length || loadingPlan} onClick={applySelectedPresets} type="button">Adicionar pacotes selecionados</button></div>
        </section>

        {selectedAccount ? <div className="mt-5 min-w-0 space-y-5">
          {selectedAccount && (
            <div className="content-panel flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar employeeId={selectedAccount.id} name={selectedAccount.name} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e9e8ff] text-sm font-extrabold text-[#5859d6]" />
                <div className="min-w-0"><p className="eyebrow">Conta selecionada</p><h2 className="truncate text-lg font-extrabold">{selectedAccount.name}</h2><p className="truncate text-xs text-[#85879a]">{selectedAccount.email} · {selectedAccount.department ?? "Sem área"}</p></div>
              </div>
              <div className="rounded-xl bg-[#f7f7fb] px-4 py-2 text-sm"><strong>{tasks.filter((task) => !excludedTaskIds.includes(task.id)).length}</strong><span className="ml-1 text-[#777a91]">tarefas incluídas</span></div>
            </div>
          )}

          {selectedAccount && <div className="content-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="eyebrow">Etapa da jornada</p><h2 className="mt-1 text-lg font-extrabold">Tarefas e materiais</h2></div>
              <select aria-label="Filtrar etapa" className="rounded-xl border border-[#e3e3ed] bg-white px-3 py-2 text-sm font-bold text-[#45475d]" value={selectedStageId ?? ""} onChange={(event) => { const value = Number(event.target.value); setSelectedStageId(value); resetDraft(value); }}>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
            {selectedStage && <p className="mt-2 text-xs text-[#85879a]">{selectedStage.duration_label ?? "Etapa do onboarding"}</p>}

            {loadingPlan ? <p className="mt-5 text-sm text-[#85879a]">Carregando padrão desta conta...</p> : stageTasks.length ? (
              <div className="mt-5 space-y-3">
                {stageTasks.map((task) => (
                  <article className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 transition ${excludedTaskIds.includes(task.id) ? "border-[#ededf3] bg-[#fafafe] opacity-60" : "border-[#ededf3] bg-white"}`} key={task.id}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f0ff] text-[#5b5ce2]"><Icon name={task.taskType === "training" ? "book" : task.taskType === "checkin" ? "calendar" : "check"} size={17} /></span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#303249]">{task.title}</h3><span className="rounded-full bg-[#f5f5f9] px-2 py-1 text-[10px] font-bold text-[#777a91]">{task.category}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${task.required ? "bg-[#fff1dc] text-[#a9681c]" : "bg-[#f1f1f5] text-[#777a91]"}`}>{task.required ? "Obrigatória" : "Opcional"}</span>{excludedTaskIds.includes(task.id) && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">Fora da jornada</span>}</div><p className="mt-1 text-xs leading-5 text-[#85879a]">{task.description || "Sem descrição."}</p><p className="mt-2 text-[10px] font-bold text-[#777a91]">Pessoa responsável: {task.ownerEmployeeId ? task.ownerName ?? task.ownerRole : "Responsável não definido — edite para escolher uma pessoa"} · Prazo: {task.dueOffsetDays} {task.dueOffsetDays === 1 ? "dia" : "dias"} após o início</p></div>
                    <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1.5 text-xs font-bold text-[#55576d]"><input className="size-4 accent-[#5b5ce2]" type="checkbox" checked={!excludedTaskIds.includes(task.id)} onChange={(event) => setExcludedTaskIds((current) => event.target.checked ? current.filter((id) => id !== task.id) : [...current, task.id])} />Incluir</label><button aria-label={`Editar ${task.title}`} className="rounded-lg border border-[#e6e6ef] px-3 py-2 text-xs font-bold text-[#5b5ce2] hover:bg-[#f6f5ff]" onClick={() => editTask(task)} type="button">Editar</button><button aria-label={`Remover ${task.title}`} className="rounded-lg border border-[#f1dada] px-3 py-2 text-xs font-bold text-[#b84f4f] hover:bg-red-50" onClick={() => removeTask(task.id)} type="button">Remover</button></div>
                  </article>
                ))}
              </div>
            ) : <div className="mt-5 rounded-xl border border-dashed border-[#dedeeb] bg-[#fafafe] p-6 text-center"><p className="text-sm font-bold text-[#55576d]">Ainda sem tarefas nesta etapa</p><p className="mt-1 text-xs text-[#85879a]">Adicione tarefas para definir o padrão desta conta.</p></div>}

            <div className="mt-7 border-t border-[#eeeeF4] pt-5">
              <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="eyebrow">Biblioteca</p><h3 className="mt-1 font-extrabold">Materiais desta etapa</h3></div><span className="text-xs text-[#85879a]">{planResources.filter((item) => item.stageTemplateId === selectedStageId).length} selecionados</span></div>
              <form className="mt-4 rounded-xl border border-dashed border-[#d8d8e7] bg-[#fafafe] p-4" onSubmit={saveResource}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-[#45475d]">{editingResourceId ? "Editar material" : "Novo material para esta etapa"}</p>
                  {editingResourceId && <button className="text-xs font-bold text-[#5b5cd5]" onClick={resetResourceDraft} type="button">Cancelar edição</button>}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Título do material</span><input required maxLength={180} className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={resourceDraft.title} onChange={(event) => setResourceDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Categoria</span><select required className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={resourceDraft.categorySlug} onChange={(event) => setResourceDraft((current) => ({ ...current, categorySlug: event.target.value }))}><option value="" disabled>Escolha uma categoria</option>{resourceCategories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label>
                  <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Descrição</span><input maxLength={1200} className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={resourceDraft.description} onChange={(event) => setResourceDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  <div className="md:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-[#55576d]">Tipo de material</span>
                    <div className="flex gap-2">
                      {(["file", "link"] as const).map((sourceType) => <button aria-pressed={resourceDraft.sourceType === sourceType} className={`rounded-lg border px-3 py-2 text-xs font-bold ${resourceDraft.sourceType === sourceType ? "border-[#b8b8f2] bg-[#f0efff] text-[#5556d8]" : "border-[#e3e3ed] bg-white text-[#777a91]"}`} key={sourceType} onClick={() => { setResourceDraft((current) => ({ ...current, sourceType, externalUrl: sourceType === "file" ? "" : current.externalUrl })); setResourceFile(null); }} type="button">{sourceType === "file" ? "Arquivo" : "Link"}</button>)}
                    </div>
                  </div>
                  {resourceDraft.sourceType === "file" ? (
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Arquivo (até 25 MB, qualquer formato)</span><input id="hr-resource-file" required={!editingResourceId || Boolean(libraryResources.find((resource) => resource.id === editingResourceId)?.external_url)} type="file" className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2 text-sm" onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)} />{editingResourceId && !libraryResources.find((resource) => resource.id === editingResourceId)?.external_url && <small className="mt-1 block text-[11px] text-[#85879a]">Deixe vazio para manter o arquivo atual.</small>}</label>
                  ) : (
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Endereço do link</span><input required maxLength={1000} type="url" className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={resourceDraft.externalUrl} onChange={(event) => setResourceDraft((current) => ({ ...current, externalUrl: event.target.value }))} placeholder="https://..." /></label>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-[#85879a]">{resourceDraft.sourceType === "file" ? "O arquivo ficará em pasta privada e poderá ser acessado pela biblioteca." : "O link ficará disponível na biblioteca para as pessoas autenticadas."}</p><button className="button-primary h-10 px-4 text-sm" disabled={uploadingResource || !selectedStage} type="submit">{uploadingResource ? "Salvando..." : editingResourceId ? "Salvar material" : "Cadastrar e adicionar à etapa"}</button></div>
              </form>
              {libraryResources.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {libraryResources.map((resource) => {
                  const checked = planResources.some((item) => item.stageTemplateId === selectedStageId && item.resourceId === resource.id);
                  return <div className={`flex items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-[#b8b8f2] bg-[#f7f6ff]" : "border-[#ededf3] bg-white hover:bg-[#fafafe]"}`} key={resource.id}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"><input className="mt-1 size-4 accent-[#5b5ce2]" type="checkbox" checked={checked} onChange={(event) => toggleResource(resource, event.target.checked)} /><span className="min-w-0"><strong className="block text-sm text-[#303249]">{resource.title}</strong><small className="mt-1 block truncate text-xs text-[#85879a]">{resource.category} · {resource.external_url ? "Link" : resource.format}</small></span></label>
                    <button className="shrink-0 rounded-lg border border-[#e6e6ef] px-2.5 py-1.5 text-[11px] font-bold text-[#5b5cd5] hover:bg-white" onClick={() => editResource(resource)} type="button">Editar</button>
                  </div>;
                })}
              </div> : <p className="mt-3 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Não há materiais publicados na biblioteca.</p>}
            </div>
          </div>}

          {selectedAccount && <form className="content-panel space-y-4" onSubmit={submitTask}>
            <div><p className="eyebrow">{editingTaskId === null ? "Nova tarefa" : "Editar tarefa"}</p><h2 className="mt-1 text-lg font-extrabold">{editingTaskId === null ? "Monte como vai aparecer" : "Atualize a tarefa"}</h2><p className="mt-1 text-sm text-[#85879a]">A tarefa será adicionada à etapa “{selectedStage?.name ?? "selecionada"}”.</p></div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
              <div className="space-y-3">
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">O que a pessoa precisa fazer?</span><input required maxLength={180} className="w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm outline-none focus:border-[#7778e5]" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Criar contas da empresa" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Instruções</span><textarea maxLength={1000} className="min-h-24 w-full rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm outline-none focus:border-[#7778e5]" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Explique os passos e como confirmar que terminou." /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Tipo / categoria</span><select className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" value={draft.taskType} onChange={(event) => setDraft((current) => ({ ...current, taskType: event.target.value as PlanTask["taskType"] }))}>{Object.entries(taskTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <div className="relative"><label className="mb-1.5 block text-xs font-bold text-[#55576d]" htmlFor="task-responsible-search">Pessoa responsável</label><input id="task-responsible-search" className="w-full rounded-lg border border-[#e3e3ed] bg-white px-3 py-2.5 text-sm" placeholder="Buscar pelo nome" value={taskResponsibleSearch} onChange={(event) => { setTaskResponsibleSearch(event.target.value); setDraft((current) => ({ ...current, ownerEmployeeId: "" })); }} />
                    {draft.ownerEmployeeId && (() => { const person = responsiblePeople.find(({ id }) => id === Number(draft.ownerEmployeeId)); return person ? <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#c9c8ed] bg-[#f7f6ff] px-3 py-2"><div className="min-w-0"><strong className="block truncate text-xs text-[#303249]">{person.name}</strong><small className="block truncate text-[10px] text-[#777a91]">{person.jobTitle ?? "Cargo não informado"} · {person.department ?? "Sem área"}</small></div><button className="shrink-0 text-[10px] font-bold text-[#5556d8]" onClick={() => setDraft((current) => ({ ...current, ownerEmployeeId: "" }))} type="button">Trocar</button></div> : null; })()}
                    {!draft.ownerEmployeeId && taskResponsibleSearch.trim() && <div className="absolute inset-x-0 top-full z-10 mt-1 space-y-1 rounded-xl border border-[#e5e5ef] bg-white p-2 shadow-lg">{responsibleMatches(taskResponsibleSearch).length ? responsibleMatches(taskResponsibleSearch).map((person) => <button className="w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-[#e5e4fa] hover:bg-[#f8f7ff]" key={person.id} onClick={() => { setDraft((current) => ({ ...current, ownerEmployeeId: String(person.id) })); setTaskResponsibleSearch(""); }} type="button"><strong className="block truncate text-xs text-[#303249]">{person.name}</strong><small className="mt-0.5 block truncate text-[10px] text-[#777a91]">{person.jobTitle ?? "Cargo não informado"} · {person.department ?? "Sem área"}</small></button>) : <p className="px-3 py-2 text-xs text-[#85879a]">Nenhuma pessoa encontrada.</p>}</div>}
                  </div>
                  <label><span className="mb-1.5 block text-xs font-bold text-[#55576d]">Prazo em dias após o início</span><input min={0} max={32767} type="number" className="w-full rounded-lg border border-[#e3e3ed] px-3 py-2.5 text-sm" value={draft.dueOffsetDays} onChange={(event) => setDraft((current) => ({ ...current, dueOffsetDays: event.target.value }))} /></label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#55576d]"><input className="size-4 accent-[#5b5ce2]" type="checkbox" checked={draft.required} onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))} /><span>Obrigatória <small className="block text-xs font-normal text-[#85879a]">Desmarque se for opcional.</small></span></label>
                </div>
              </div>
              <aside className="h-fit rounded-2xl border border-[#e8e8f0] bg-[#fafafe] p-4">
                <p className="eyebrow">Prévia da jornada</p>
                <article className="mt-3 rounded-xl border border-[#ededf3] bg-white p-4">
                  <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f0ff] text-[#5b5ce2]"><Icon name={draft.taskType === "training" ? "book" : draft.taskType === "checkin" ? "calendar" : "check"} size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[#303249]">{draft.title || "Título da tarefa"}</h3><span className="rounded-full bg-[#f5f5f9] px-2 py-1 text-[10px] font-bold text-[#777a91]">{taskTypeLabels[draft.taskType]}</span></div><p className="mt-2 text-sm leading-5 text-[#777a91]">{draft.description || "As instruções para a pessoa aparecerão aqui."}</p></div></div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeeF4] pt-3"><span className="text-xs text-[#777a91]">Pessoa responsável: <strong className="text-[#45475d]">{accounts.find(({ id }) => id === Number(draft.ownerEmployeeId))?.name ?? "Selecione uma pessoa"}</strong></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${draft.required ? "bg-[#fff1dc] text-[#a9681c]" : "bg-[#f1f1f5] text-[#777a91]"}`}>{draft.required ? "Obrigatória" : "Opcional"}</span></div>
                </article>
                <p className="mt-3 text-[11px] leading-5 text-[#85879a]">Prazo: {draft.dueOffsetDays || "0"} {Number(draft.dueOffsetDays) === 1 ? "dia" : "dias"} após o início</p>
              </aside>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#eeeeF4] pt-4"><button className="rounded-xl border border-[#e3e3ed] px-4 py-3 text-sm font-bold text-[#777a91]" onClick={() => resetDraft()} type="button">Limpar</button><button className="button-primary h-12 px-5" type="submit">{editingTaskId === null ? "Adicionar à etapa" : "Salvar alterações"}</button></div>
          </form>}
        </div> : null}
      </div>}
      {section === "plans" && selectedAccountId && <button aria-label="Salvar jornada no banco de dados" className="button-primary fixed bottom-6 right-6 z-40 h-14 rounded-full px-6 shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl sm:bottom-8 sm:right-8" disabled={saving || loadingPlan} onClick={savePlan} type="button"><Icon name="check" size={18} /> {saving ? "Salvando..." : "Salvar jornada"}</button>}
    </section>
  );
}

function TeamPeoplePicker({ title, people, selectedIds, onToggle, helper }: { title: string; people: Account[]; selectedIds: number[]; onToggle: (id: number) => void; helper?: string }) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const matches = normalizedSearch.length >= 2
    ? people.filter((person) => `${person.name} ${person.email} ${person.jobTitle ?? ""} ${person.departments.join(" ")}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedSearch))
    : [];
  const selectedPeople = people.filter((person) => selectedIds.includes(person.id));

  return <details className="rounded-xl border border-[#e3e3ed] bg-white p-3">
    <summary className="cursor-pointer list-none text-sm font-bold text-[#45475d]">{title}<span className="ml-2 rounded-full bg-[#f0efff] px-2 py-0.5 text-[10px] font-extrabold text-[#5556d8]">{selectedIds.length} selecionadas</span></summary>
    {helper && <p className="mt-2 text-[11px] text-[#85879a]">{helper}</p>}
    <label className="mt-3 block"><span className="sr-only">Buscar pessoa por nome, e-mail, cargo ou área</span><span className="relative block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9698aa]"><Icon name="search" size={16} /></span><input className="w-full rounded-lg border border-[#e3e3ed] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#b8b8ec]" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, cargo ou área..." /></span></label>
    <div className="mt-3 space-y-3">
      {selectedPeople.length > 0 && <div><p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#85879a]">Selecionadas</p><div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{selectedPeople.map((person) => <button className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f0efff] py-1 pl-1 pr-2 text-[10px] font-bold text-[#5556d8] hover:bg-[#e7e6ff]" key={person.id} onClick={() => onToggle(person.id)} type="button" title={`Remover ${person.name}`}><EmployeeAvatar employeeId={person.id} name={person.name} className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-[8px] font-extrabold text-[#5b5ce2]" /><span className="truncate">{person.name}</span><span aria-hidden="true">×</span></button>)}</div></div>}
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {!people.length ? <p className="px-2 py-2 text-xs text-[#85879a]">Nenhuma pessoa ativa cadastrada.</p>
          : normalizedSearch.length < 2 ? <p className="px-2 py-3 text-xs text-[#85879a]">Digite pelo menos 2 caracteres para buscar entre {people.length} pessoas.</p>
            : matches.length ? matches.map((person) => <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-[#fafafe]" key={person.id}>
              <input className="mt-0.5 size-4 accent-[#5b5ce2]" type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => onToggle(person.id)} />
              <EmployeeAvatar employeeId={person.id} name={person.name} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f1f0ff] text-[10px] font-extrabold text-[#5b5ce2]" />
              <span className="min-w-0"><strong className="block truncate text-xs text-[#303249]">{person.name}</strong><small className="block truncate text-[10px] text-[#85879a]">{person.email} · {person.jobTitle || "Cargo não informado"} · {person.departments.join(", ") || "Sem área"}</small></span>
            </label>) : <p className="px-2 py-3 text-xs text-[#85879a]">Nenhuma pessoa encontrada para “{search}”.</p>}
      </div>
    </div>
  </details>;
}

export default HrPlansView;
