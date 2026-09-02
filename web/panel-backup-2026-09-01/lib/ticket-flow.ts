export type TicketFlowNodeType =
  | "start"
  | "select"
  | "modal"
  | "message"
  | "create_pending"
  | "end";

export type TicketFlowSelectSource =
  | "categories"
  | "problems"
  | "supportAreas"
  | "custom";

export type TicketFlowOption = {
  value: string;
  label: string;
  description?: string;
};

export type TicketFlowModalField = {
  id: string;
  label: string;
  placeholder?: string;
  style?: "short" | "paragraph";
  required?: boolean;
  maxLength?: number;
};

export type TicketFlowNodeData = {
  label: string;
  /** select */
  selectSource?: TicketFlowSelectSource;
  selectPlaceholder?: string;
  customOptions?: TicketFlowOption[];
  saveAs?: string;
  /** modal */
  modalTitle?: string;
  modalFields?: TicketFlowModalField[];
  /** message */
  messageText?: string;
  /** end */
  endKind?: "success" | "cancel";
};

export type TicketFlowNode = {
  id: string;
  type: TicketFlowNodeType;
  x: number;
  y: number;
  data: TicketFlowNodeData;
};

export type TicketFlowEdge = {
  id: string;
  source: string;
  target: string;
  /** For branching from select menus */
  optionValue?: string;
  label?: string;
};

export type TicketFlowGraph = {
  enabled: boolean;
  nodes: TicketFlowNode[];
  edges: TicketFlowEdge[];
  updatedAt?: string;
};

export const FLOW_NODE_META: Record<
  TicketFlowNodeType,
  { title: string; color: string; description: string }
> = {
  start: {
    title: "Inicio",
    color: "#22c55e",
    description: "Botón del panel · punto de entrada",
  },
  select: {
    title: "Menú select",
    color: "#38bdf8",
    description: "El usuario elige una opción",
  },
  modal: {
    title: "Formulario",
    color: "#a78bfa",
    description: "Modal de Discord con campos",
  },
  message: {
    title: "Mensaje",
    color: "#f59e0b",
    description: "Respuesta efímera al usuario",
  },
  create_pending: {
    title: "Crear solicitud",
    color: "#f97316",
    description: "Envía la solicitud pendiente al staff",
  },
  end: {
    title: "Fin",
    color: "#94a3b8",
    description: "Cierra el flujo",
  },
};

let nodeSeq = 1;
let edgeSeq = 1;

export function newFlowNodeId() {
  return `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}`;
}

export function newFlowEdgeId() {
  return `e${Date.now().toString(36)}${(edgeSeq++).toString(36)}`;
}

export function createDefaultTicketFlow(): TicketFlowGraph {
  const startId = "n_start";
  const catId = "n_cat";
  const issueId = "n_issue";
  const modalId = "n_modal";
  const pendingId = "n_pending";
  const endId = "n_end";

  return {
    enabled: false,
    nodes: [
      {
        id: startId,
        type: "start",
        x: 40,
        y: 180,
        data: { label: "Abrir ticket" },
      },
      {
        id: catId,
        type: "select",
        x: 260,
        y: 120,
        data: {
          label: "Categoría",
          selectSource: "categories",
          selectPlaceholder: "Selecciona una categoría",
          saveAs: "category",
        },
      },
      {
        id: issueId,
        type: "select",
        x: 500,
        y: 120,
        data: {
          label: "Problema",
          selectSource: "problems",
          selectPlaceholder: "Selecciona un problema",
          saveAs: "commonIssue",
        },
      },
      {
        id: modalId,
        type: "modal",
        x: 740,
        y: 120,
        data: {
          label: "Detalle",
          modalTitle: "Describe tu solicitud",
          modalFields: [
            {
              id: "reason",
              label: "Motivo",
              placeholder: "Explica qué necesitas…",
              style: "paragraph",
              required: true,
              maxLength: 1000,
            },
          ],
        },
      },
      {
        id: pendingId,
        type: "create_pending",
        x: 980,
        y: 120,
        data: { label: "Enviar a staff" },
      },
      {
        id: endId,
        type: "end",
        x: 1220,
        y: 180,
        data: { label: "Listo", endKind: "success" },
      },
    ],
    edges: [
      { id: "e1", source: startId, target: catId },
      { id: "e2", source: catId, target: issueId },
      { id: "e3", source: issueId, target: modalId },
      { id: "e4", source: modalId, target: pendingId },
      { id: "e5", source: pendingId, target: endId },
    ],
  };
}

export function normalizeTicketFlow(raw: unknown): TicketFlowGraph {
  const fallback = createDefaultTicketFlow();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const nodesIn = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edgesIn = Array.isArray(obj.edges) ? obj.edges : [];

  const nodes: TicketFlowNode[] = nodesIn
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const n = entry as Record<string, unknown>;
      const type = String(n.type || "") as TicketFlowNodeType;
      if (!FLOW_NODE_META[type]) return null;
      const dataRaw = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
      const data: TicketFlowNodeData = {
        label: String(dataRaw.label || FLOW_NODE_META[type].title).slice(0, 80),
        selectSource: (["categories", "problems", "supportAreas", "custom"].includes(
          String(dataRaw.selectSource)
        )
          ? String(dataRaw.selectSource)
          : "categories") as TicketFlowSelectSource,
        selectPlaceholder: String(dataRaw.selectPlaceholder || "Selecciona una opción").slice(0, 100),
        saveAs: String(dataRaw.saveAs || "").slice(0, 40),
        customOptions: Array.isArray(dataRaw.customOptions)
          ? dataRaw.customOptions
              .map((opt, i) => {
                if (!opt || typeof opt !== "object") return null;
                const o = opt as Record<string, unknown>;
                const label = String(o.label || "").trim().slice(0, 100);
                if (!label) return null;
                return {
                  value: String(o.value || `opt-${i + 1}`).slice(0, 100),
                  label,
                  description: String(o.description || "").slice(0, 100),
                };
              })
              .filter(Boolean) as TicketFlowOption[]
          : [],
        modalTitle: String(dataRaw.modalTitle || "Formulario").slice(0, 45),
        modalFields: Array.isArray(dataRaw.modalFields)
          ? dataRaw.modalFields
              .slice(0, 5)
              .map((field, i) => {
                if (!field || typeof field !== "object") return null;
                const f = field as Record<string, unknown>;
                const label = String(f.label || `Campo ${i + 1}`).slice(0, 45);
                return {
                  id: String(f.id || `field_${i + 1}`).slice(0, 40),
                  label,
                  placeholder: String(f.placeholder || "").slice(0, 100),
                  style: f.style === "paragraph" ? "paragraph" : "short",
                  required: f.required !== false,
                  maxLength: Math.min(1000, Math.max(1, Number(f.maxLength) || 300)),
                } as TicketFlowModalField;
              })
              .filter(Boolean) as TicketFlowModalField[]
          : [],
        messageText: String(dataRaw.messageText || "").slice(0, 500),
        endKind: dataRaw.endKind === "cancel" ? "cancel" : "success",
      };
      return {
        id: String(n.id || `n${index + 1}`).slice(0, 40),
        type,
        x: Number.isFinite(Number(n.x)) ? Number(n.x) : 40 + index * 220,
        y: Number.isFinite(Number(n.y)) ? Number(n.y) : 120,
        data,
      } satisfies TicketFlowNode;
    })
    .filter(Boolean) as TicketFlowNode[];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: TicketFlowEdge[] = edgesIn
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const source = String(e.source || "");
      const target = String(e.target || "");
      if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return null;
      return {
        id: String(e.id || `e${index + 1}`).slice(0, 40),
        source,
        target,
        optionValue: String(e.optionValue || "").slice(0, 100) || undefined,
        label: String(e.label || "").slice(0, 40) || undefined,
      } satisfies TicketFlowEdge;
    })
    .filter(Boolean) as TicketFlowEdge[];

  if (!nodes.some((n) => n.type === "start")) {
    return fallback;
  }

  return {
    enabled: obj.enabled === true,
    nodes: nodes.slice(0, 40),
    edges: edges.slice(0, 80),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
  };
}

export type TicketFlowValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateTicketFlow(flow: TicketFlowGraph): TicketFlowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const starts = flow.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) errors.push("Debe haber exactamente un nodo Inicio.");
  if (!flow.nodes.some((n) => n.type === "create_pending")) {
    warnings.push("No hay nodo «Crear solicitud»: el flujo no abrirá tickets.");
  }
  if (!flow.nodes.some((n) => n.type === "end")) {
    warnings.push("No hay nodo Fin.");
  }

  const outs = new Map<string, TicketFlowEdge[]>();
  for (const edge of flow.edges) {
    if (!outs.has(edge.source)) outs.set(edge.source, []);
    outs.get(edge.source)!.push(edge);
  }

  for (const node of flow.nodes) {
    if (node.type === "end") continue;
    const next = outs.get(node.id) || [];
    if (!next.length) warnings.push(`«${node.data.label || node.id}» no tiene salida.`);
    if (node.type === "start" && next.length > 1) {
      warnings.push("El Inicio debería tener una sola salida.");
    }
    if (node.type === "modal" && !(node.data.modalFields || []).length) {
      errors.push(`El formulario «${node.data.label}» no tiene campos.`);
    }
    if (node.type === "select" && node.data.selectSource === "custom") {
      if (!(node.data.customOptions || []).length) {
        errors.push(`El select «${node.data.label}» no tiene opciones custom.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function getOutgoingEdges(flow: TicketFlowGraph, nodeId: string): TicketFlowEdge[] {
  return flow.edges.filter((e) => e.source === nodeId);
}

export function pickNextEdge(
  flow: TicketFlowGraph,
  nodeId: string,
  optionValue?: string
): TicketFlowEdge | null {
  const edges = getOutgoingEdges(flow, nodeId);
  if (!edges.length) return null;
  if (optionValue) {
    const match = edges.find((e) => e.optionValue && e.optionValue === optionValue);
    if (match) return match;
  }
  const generic = edges.find((e) => !e.optionValue);
  return generic || edges[0] || null;
}
