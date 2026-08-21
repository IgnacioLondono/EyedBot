'use strict';

const FLOW_NODE_TYPES = new Set(['start', 'select', 'modal', 'message', 'create_pending', 'end']);

function createDefaultTicketFlow() {
    const startId = 'n_start';
    const catId = 'n_cat';
    const issueId = 'n_issue';
    const modalId = 'n_modal';
    const pendingId = 'n_pending';
    const endId = 'n_end';

    return {
        enabled: false,
        nodes: [
            { id: startId, type: 'start', x: 40, y: 180, data: { label: 'Abrir ticket' } },
            {
                id: catId,
                type: 'select',
                x: 260,
                y: 120,
                data: {
                    label: 'Categoria',
                    selectSource: 'categories',
                    selectPlaceholder: 'Selecciona una categoria',
                    saveAs: 'category'
                }
            },
            {
                id: issueId,
                type: 'select',
                x: 500,
                y: 120,
                data: {
                    label: 'Problema',
                    selectSource: 'problems',
                    selectPlaceholder: 'Selecciona un problema',
                    saveAs: 'commonIssue'
                }
            },
            {
                id: modalId,
                type: 'modal',
                x: 740,
                y: 120,
                data: {
                    label: 'Detalle',
                    modalTitle: 'Describe tu solicitud',
                    modalFields: [
                        {
                            id: 'reason',
                            label: 'Motivo',
                            placeholder: 'Explica que necesitas…',
                            style: 'paragraph',
                            required: true,
                            maxLength: 1000
                        }
                    ]
                }
            },
            { id: pendingId, type: 'create_pending', x: 980, y: 120, data: { label: 'Enviar a staff' } },
            { id: endId, type: 'end', x: 1220, y: 180, data: { label: 'Listo', endKind: 'success' } }
        ],
        edges: [
            { id: 'e1', source: startId, target: catId },
            { id: 'e2', source: catId, target: issueId },
            { id: 'e3', source: issueId, target: modalId },
            { id: 'e4', source: modalId, target: pendingId },
            { id: 'e5', source: pendingId, target: endId }
        ]
    };
}

function normalizeTicketFlow(raw) {
    const fallback = createDefaultTicketFlow();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;

    const nodesIn = Array.isArray(raw.nodes) ? raw.nodes : [];
    const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];

    const nodes = nodesIn
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') return null;
            const type = String(entry.type || '');
            if (!FLOW_NODE_TYPES.has(type)) return null;
            const dataRaw = entry.data && typeof entry.data === 'object' ? entry.data : {};
            const customOptions = Array.isArray(dataRaw.customOptions)
                ? dataRaw.customOptions
                    .map((opt, i) => {
                        if (!opt || typeof opt !== 'object') return null;
                        const label = String(opt.label || '').trim().slice(0, 100);
                        if (!label) return null;
                        return {
                            value: String(opt.value || `opt-${i + 1}`).slice(0, 100),
                            label,
                            description: String(opt.description || '').slice(0, 100)
                        };
                    })
                    .filter(Boolean)
                : [];

            const modalFields = Array.isArray(dataRaw.modalFields)
                ? dataRaw.modalFields
                    .slice(0, 5)
                    .map((field, i) => {
                        if (!field || typeof field !== 'object') return null;
                        const label = String(field.label || `Campo ${i + 1}`).slice(0, 45);
                        return {
                            id: String(field.id || `field_${i + 1}`).slice(0, 40),
                            label,
                            placeholder: String(field.placeholder || '').slice(0, 100),
                            style: field.style === 'paragraph' ? 'paragraph' : 'short',
                            required: field.required !== false,
                            maxLength: Math.min(1000, Math.max(1, Number(field.maxLength) || 300))
                        };
                    })
                    .filter(Boolean)
                : [];

            return {
                id: String(entry.id || `n${index + 1}`).slice(0, 40),
                type,
                x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : 40 + index * 220,
                y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : 120,
                data: {
                    label: String(dataRaw.label || type).slice(0, 80),
                    selectSource: ['categories', 'problems', 'supportAreas', 'custom'].includes(String(dataRaw.selectSource))
                        ? String(dataRaw.selectSource)
                        : 'categories',
                    selectPlaceholder: String(dataRaw.selectPlaceholder || 'Selecciona una opcion').slice(0, 100),
                    saveAs: String(dataRaw.saveAs || '').slice(0, 40),
                    customOptions,
                    modalTitle: String(dataRaw.modalTitle || 'Formulario').slice(0, 45),
                    modalFields,
                    messageText: String(dataRaw.messageText || '').slice(0, 500),
                    endKind: dataRaw.endKind === 'cancel' ? 'cancel' : 'success'
                }
            };
        })
        .filter(Boolean)
        .slice(0, 40);

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = edgesIn
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') return null;
            const source = String(entry.source || '');
            const target = String(entry.target || '');
            if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return null;
            return {
                id: String(entry.id || `e${index + 1}`).slice(0, 40),
                source,
                target,
                optionValue: String(entry.optionValue || '').slice(0, 100) || undefined,
                label: String(entry.label || '').slice(0, 40) || undefined
            };
        })
        .filter(Boolean)
        .slice(0, 80);

    if (!nodes.some((n) => n.type === 'start')) return fallback;

    return {
        enabled: raw.enabled === true,
        nodes,
        edges,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined
    };
}

function validateTicketFlow(flow) {
    const errors = [];
    const warnings = [];
    const starts = (flow.nodes || []).filter((n) => n.type === 'start');
    if (starts.length !== 1) errors.push('Debe haber exactamente un nodo Inicio.');
    if (!(flow.nodes || []).some((n) => n.type === 'create_pending')) {
        warnings.push('No hay nodo Crear solicitud.');
    }
    return { ok: errors.length === 0, errors, warnings };
}

function getNode(flow, nodeId) {
    return (flow.nodes || []).find((n) => n.id === nodeId) || null;
}

function getStartNode(flow) {
    return (flow.nodes || []).find((n) => n.type === 'start') || null;
}

function pickNextEdge(flow, nodeId, optionValue) {
    const edges = (flow.edges || []).filter((e) => e.source === nodeId);
    if (!edges.length) return null;
    if (optionValue) {
        const match = edges.find((e) => e.optionValue && e.optionValue === optionValue);
        if (match) return match;
    }
    return edges.find((e) => !e.optionValue) || edges[0] || null;
}

function isCustomFlowActive(cfg) {
    const flow = normalizeTicketFlow(cfg?.customFlow);
    if (!flow.enabled) return false;
    return validateTicketFlow(flow).ok;
}

module.exports = {
    createDefaultTicketFlow,
    normalizeTicketFlow,
    validateTicketFlow,
    getNode,
    getStartNode,
    pickNextEdge,
    isCustomFlowActive
};
