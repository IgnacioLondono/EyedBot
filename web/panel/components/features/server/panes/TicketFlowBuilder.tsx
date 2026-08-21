"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  GitBranch,
  Plus,
  RotateCcw,
  Trash2,
  Link2,
  MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Alert } from "@/components/ui/Alert";
import { Field, Textarea } from "@/components/features/shared";
import {
  FLOW_NODE_META,
  createDefaultTicketFlow,
  newFlowEdgeId,
  newFlowNodeId,
  validateTicketFlow,
  type TicketFlowEdge,
  type TicketFlowGraph,
  type TicketFlowNode,
  type TicketFlowNodeType,
  type TicketFlowSelectSource,
} from "@/lib/ticket-flow";
import { cn } from "@/lib/utils";

const NODE_W = 196;
const NODE_H = 88;

type Props = {
  value: TicketFlowGraph;
  onChange: (next: TicketFlowGraph) => void;
};

function edgePath(from: TicketFlowNode, to: TicketFlowNode) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const ADDABLE: TicketFlowNodeType[] = [
  "select",
  "modal",
  "message",
  "create_pending",
  "end",
];

export function TicketFlowBuilder({ value, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    id: string;
    ox: number;
    oy: number;
    nx: number;
    ny: number;
  } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const nodesById = useMemo(() => {
    const map = new Map<string, TicketFlowNode>();
    for (const n of value.nodes) map.set(n.id, n);
    return map;
  }, [value.nodes]);

  const selected = selectedId ? nodesById.get(selectedId) || null : null;
  const validation = useMemo(() => validateTicketFlow(value), [value]);

  const patch = useCallback(
    (updater: (prev: TicketFlowGraph) => TicketFlowGraph) => {
      onChange(updater(value));
    },
    [onChange, value]
  );

  function addNode(type: TicketFlowNodeType) {
    const meta = FLOW_NODE_META[type];
    const id = newFlowNodeId();
    const node: TicketFlowNode = {
      id,
      type,
      x: 120 - pan.x + value.nodes.length * 24,
      y: 140 - pan.y + (value.nodes.length % 3) * 30,
      data: {
        label: meta.title,
        selectSource: "categories",
        selectPlaceholder: "Selecciona una opción",
        saveAs: type === "select" ? "choice" : "",
        modalTitle: "Formulario",
        modalFields:
          type === "modal"
            ? [
                {
                  id: "reason",
                  label: "Motivo",
                  placeholder: "Escribe aquí…",
                  style: "paragraph",
                  required: true,
                  maxLength: 1000,
                },
              ]
            : [],
        customOptions: [],
        messageText: "Mensaje para el usuario",
        endKind: "success",
      },
    };
    patch((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedId(id);
  }

  function removeNode(id: string) {
    const node = nodesById.get(id);
    if (!node || node.type === "start") return;
    patch((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  }

  function connect(source: string, target: string) {
    if (source === target) return;
    const exists = value.edges.some((e) => e.source === source && e.target === target && !e.optionValue);
    if (exists) return;
    const edge: TicketFlowEdge = { id: newFlowEdgeId(), source, target };
    patch((prev) => ({ ...prev, edges: [...prev.edges, edge] }));
    setConnectFrom(null);
  }

  function removeEdge(id: string) {
    patch((prev) => ({ ...prev, edges: prev.edges.filter((e) => e.id !== id) }));
  }

  function updateSelected(partial: Partial<TicketFlowNode["data"]>) {
    if (!selected) return;
    patch((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selected.id ? { ...n, data: { ...n.data, ...partial } } : n
      ),
    }));
  }

  function onNodePointerDown(event: React.PointerEvent, node: TicketFlowNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(node.id);
    if (connectFrom) {
      if (connectFrom !== node.id) connect(connectFrom, node.id);
      return;
    }
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: node.id,
      ox: event.clientX,
      oy: event.clientY,
      nx: node.x,
      ny: node.y,
    };
  }

  function onNodePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.ox;
    const dy = event.clientY - drag.oy;
    const x = Math.round(drag.nx + dx);
    const y = Math.round(drag.ny + dy);
    patch((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === drag.id ? { ...n, x, y } : n)),
    }));
  }

  function onNodePointerUp(event: React.PointerEvent) {
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onCanvasPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-flow-node]")) return;
    setSelectedId(null);
    setConnectFrom(null);
    panRef.current = { sx: event.clientX, sy: event.clientY, px: pan.x, py: pan.y };
    setPanning(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onCanvasPointerMove(event: React.PointerEvent) {
    const p = panRef.current;
    if (!p) return;
    setPan({
      x: p.px + (event.clientX - p.sx),
      y: p.py + (event.clientY - p.sy),
    });
  }

  function onCanvasPointerUp(event: React.PointerEvent) {
    panRef.current = null;
    setPanning(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  const selectedOutEdges = value.edges.filter((e) => e.source === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-violet-400/30 bg-violet-500/15 p-2 text-violet-200">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-white">Flujo personalizado</p>
            <p className="text-sm text-zinc-400">
              Arrastra nodos, conecta con líneas y define el recorrido del ticket.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Usar este flujo</span>
          <Switch
            checked={value.enabled}
            onCheckedChange={(checked) => patch((prev) => ({ ...prev, enabled: checked }))}
          />
        </div>
      </div>

      {!validation.ok ? (
        <Alert
          title="El flujo tiene errores"
          description={validation.errors.join(" · ")}
          variant="danger"
        />
      ) : null}
      {validation.warnings.length ? (
        <Alert title="Avisos" description={validation.warnings.join(" · ")} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {ADDABLE.map((type) => (
          <Button key={type} size="sm" variant="secondary" onClick={() => addNode(type)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {FLOW_NODE_META[type].title}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange(createDefaultTicketFlow());
            setSelectedId(null);
            setConnectFrom(null);
          }}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Plantilla base
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div
          ref={canvasRef}
          className={cn(
            "relative h-[520px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0d12]",
            panning ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
        >
          <div
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
          >
            <svg className="pointer-events-none absolute left-0 top-0 h-[2000px] w-[3000px] overflow-visible">
              <defs>
                <marker
                  id="ticket-flow-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(167,139,250,0.9)" />
                </marker>
              </defs>
              {value.edges.map((edge) => {
                const from = nodesById.get(edge.source);
                const to = nodesById.get(edge.target);
                if (!from || !to) return null;
                const active =
                  selectedId === edge.source ||
                  selectedId === edge.target ||
                  selectedId === edge.id;
                return (
                  <g key={edge.id}>
                    <path
                      d={edgePath(from, to)}
                      fill="none"
                      stroke={active ? "rgba(167,139,250,0.95)" : "rgba(148,163,184,0.45)"}
                      strokeWidth={active ? 2.5 : 1.8}
                      markerEnd="url(#ticket-flow-arrow)"
                    />
                    {edge.label || edge.optionValue ? (
                      <text
                        x={(from.x + NODE_W + to.x) / 2}
                        y={(from.y + to.y) / 2 + NODE_H / 2 - 8}
                        fill="rgba(226,232,240,0.8)"
                        fontSize="11"
                        textAnchor="middle"
                      >
                        {edge.label || edge.optionValue}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {value.nodes.map((node) => {
              const meta = FLOW_NODE_META[node.type];
              const isSelected = selectedId === node.id;
              const isConnectSource = connectFrom === node.id;
              return (
                <div
                  key={node.id}
                  data-flow-node
                  className={cn(
                    "absolute select-none rounded-2xl border bg-[#12151c]/90 shadow-lg backdrop-blur",
                    isSelected ? "border-violet-400/70 ring-2 ring-violet-400/30" : "border-white/10",
                    isConnectSource ? "border-sky-400/80" : ""
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_W,
                    minHeight: NODE_H,
                  }}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                >
                  <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      {meta.title}
                    </span>
                  </div>
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-white">
                      {node.data.label || meta.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">{meta.description}</p>
                  </div>
                  {node.type !== "end" ? (
                    <button
                      type="button"
                      title="Conectar desde aquí"
                      className={cn(
                        "absolute -right-2 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border text-[10px]",
                        isConnectSource
                          ? "border-sky-300 bg-sky-400 text-black"
                          : "border-white/20 bg-zinc-800 text-zinc-200 hover:border-violet-300"
                      )}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setConnectFrom((cur) => (cur === node.id ? null : node.id));
                        setSelectedId(node.id);
                      }}
                    >
                      <Link2 className="h-3 w-3" />
                    </button>
                  ) : null}
                  {node.type !== "start" ? (
                    <button
                      type="button"
                      title="Entrada"
                      className="absolute -left-2 top-1/2 z-10 h-5 w-5 -translate-y-1/2 rounded-full border border-white/20 bg-zinc-800"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (connectFrom && connectFrom !== node.id) {
                          connect(connectFrom, node.id);
                        } else {
                          setSelectedId(node.id);
                        }
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-zinc-400">
            <MousePointer2 className="h-3.5 w-3.5" />
            Arrastra el fondo · clic en ○──● para unir
            {connectFrom ? " · elige el nodo destino" : ""}
          </div>
        </div>

        <div className="space-y-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-medium text-white">Inspector</p>
          {!selected ? (
            <p className="text-sm text-zinc-500">Selecciona un nodo para editarlo.</p>
          ) : (
            <div className="space-y-3">
              <Field label="Etiqueta">
                <Input
                  value={selected.data.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </Field>

              {selected.type === "select" ? (
                <>
                  <Field label="Fuente de opciones">
                    <select
                      className="h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
                      value={selected.data.selectSource || "categories"}
                      onChange={(e) =>
                        updateSelected({
                          selectSource: e.target.value as TicketFlowSelectSource,
                        })
                      }
                    >
                      <option value="categories">Categorías del panel</option>
                      <option value="problems">Problemas comunes</option>
                      <option value="supportAreas">Áreas Eyed.bio</option>
                      <option value="custom">Opciones custom</option>
                    </select>
                  </Field>
                  <Field label="Placeholder">
                    <Input
                      value={selected.data.selectPlaceholder || ""}
                      onChange={(e) => updateSelected({ selectPlaceholder: e.target.value })}
                    />
                  </Field>
                  <Field label="Guardar como (clave)">
                    <Input
                      value={selected.data.saveAs || ""}
                      onChange={(e) => updateSelected({ saveAs: e.target.value })}
                      placeholder="category / commonIssue / …"
                    />
                  </Field>
                  {selected.data.selectSource === "custom" ? (
                    <Field label="Opciones (label|value por línea)">
                      <Textarea
                        value={(selected.data.customOptions || [])
                          .map((o) => `${o.label}|${o.value}`)
                          .join("\n")}
                        onChange={(e) => {
                          const customOptions = e.target.value
                            .split("\n")
                            .map((line, i) => {
                              const [label, value] = line.split("|").map((s) => s.trim());
                              if (!label) return null;
                              return {
                                value: value || `opt-${i + 1}`,
                                label,
                              };
                            })
                            .filter(Boolean) as { value: string; label: string }[];
                          updateSelected({ customOptions });
                        }}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              {selected.type === "modal" ? (
                <>
                  <Field label="Título del modal">
                    <Input
                      value={selected.data.modalTitle || ""}
                      onChange={(e) => updateSelected({ modalTitle: e.target.value })}
                    />
                  </Field>
                  <Field label="Campos (label|id|short/paragraph)">
                    <Textarea
                      value={(selected.data.modalFields || [])
                        .map((f) => `${f.label}|${f.id}|${f.style || "short"}`)
                        .join("\n")}
                      onChange={(e) => {
                        const modalFields = e.target.value
                          .split("\n")
                          .slice(0, 5)
                          .map((line, i) => {
                            const [label, id, style] = line.split("|").map((s) => s.trim());
                            if (!label) return null;
                            return {
                              id: id || `field_${i + 1}`,
                              label,
                              style: style === "paragraph" ? "paragraph" : "short",
                              required: true,
                              maxLength: style === "paragraph" ? 1000 : 200,
                              placeholder: "",
                            } as const;
                          })
                          .filter(Boolean);
                        updateSelected({ modalFields: modalFields as TicketFlowNode["data"]["modalFields"] });
                      }}
                    />
                  </Field>
                </>
              ) : null}

              {selected.type === "message" ? (
                <Field label="Texto del mensaje">
                  <Textarea
                    value={selected.data.messageText || ""}
                    onChange={(e) => updateSelected({ messageText: e.target.value })}
                  />
                </Field>
              ) : null}

              {selected.type === "end" ? (
                <Field label="Tipo de fin">
                  <select
                    className="h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
                    value={selected.data.endKind || "success"}
                    onChange={(e) =>
                      updateSelected({
                        endKind: e.target.value === "cancel" ? "cancel" : "success",
                      })
                    }
                  >
                    <option value="success">Éxito</option>
                    <option value="cancel">Cancelar</option>
                  </select>
                </Field>
              ) : null}

              {selectedOutEdges.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Salidas
                  </p>
                  {selectedOutEdges.map((edge) => {
                    const target = nodesById.get(edge.target);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/30 p-2"
                      >
                        <Input
                          className="h-8"
                          placeholder="rama (option value)"
                          value={edge.optionValue || ""}
                          onChange={(e) => {
                            const optionValue = e.target.value;
                            patch((prev) => ({
                              ...prev,
                              edges: prev.edges.map((item) =>
                                item.id === edge.id
                                  ? {
                                      ...item,
                                      optionValue: optionValue || undefined,
                                      label: optionValue || undefined,
                                    }
                                  : item
                              ),
                            }));
                          }}
                        />
                        <span className="shrink-0 text-xs text-zinc-500">
                          → {target?.data.label || edge.target}
                        </span>
                        <Button size="sm" variant="danger" onClick={() => removeEdge(edge.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {selected.type !== "start" ? (
                <Button size="sm" variant="danger" onClick={() => removeNode(selected.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Eliminar nodo
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
