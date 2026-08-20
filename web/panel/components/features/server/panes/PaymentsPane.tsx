"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Send, RefreshCw } from "lucide-react";
import {
  getPaymentReceiptConfig,
  savePaymentReceiptConfig,
  sendPaymentReceipt,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type FieldMapState = {
  orderId: string;
  amount: string;
  currency: string;
  product: string;
  status: string;
  buyerName: string;
  buyerDiscordId: string;
  date: string;
  extra: string;
  steam: string;
  email: string;
  server: string;
  rcon: string;
  gateway: string;
  authCode: string;
  paymentType: string;
  cardLast4: string;
};

type HistoryEntry = {
  id: string;
  at: string;
  orderId: string;
  amount: string;
  product: string;
  status: string;
  buyerDiscordId: string;
  channelSent: boolean;
  dmSent: boolean;
  source: string;
};

type PaymentsState = {
  enabled: boolean;
  channelId: string;
  sendToChannel: boolean;
  sendDm: boolean;
  mentionRoleId: string;
  color: string;
  layout: "fields" | "text";
  titleTemplate: string;
  descriptionTemplate: string;
  footerTemplate: string;
  labelSteam: string;
  labelName: string;
  labelEmail: string;
  labelOrder: string;
  labelAmount: string;
  labelServer: string;
  labelRcon: string;
  labelDiscord: string;
  labelGateway: string;
  labelAuth: string;
  labelPaymentType: string;
  labelCard: string;
  webhookSecret: string;
  fieldMap: FieldMapState;
  history: HistoryEntry[];
};

type ManualForm = {
  orderId: string;
  amount: string;
  currency: string;
  product: string;
  status: string;
  buyerName: string;
  buyerDiscordId: string;
  steam: string;
  email: string;
  server: string;
  rcon: string;
  extra: string;
  sendToChannel: boolean;
  sendDm: boolean;
};

const DEFAULT_FIELD_MAP: FieldMapState = {
  orderId: "order_id|orderId|buyOrder|id|folio|comprobante_id|receipt_id",
  amount: "amount|monto|total|value|pago",
  currency: "currency|moneda|currency_code|divisa",
  product: "product|producto|item|description|concepto|servicio|plan",
  status: "status|estado|payment_status|estado_pago",
  buyerName: "buyer_name|buyer|cliente|customer_name|nombre|payer_name|playerName|player_name",
  buyerDiscordId: "discord_id|discordId|buyer_discord_id|user_id|discord_user_id",
  date: "date|fecha|paid_at|created_at|timestamp|vipGrantedAt",
  extra: "note|notes|detalle|message|comentario|observacion",
  steam: "steam|steamId|steam_id|steamid",
  email: "email|correo|mail|payer_email",
  server: "server|servidor|server_status|rconText|rcon_status",
  rcon: "rcon|rcon_log|rconLog|replies|replyLine",
  gateway: "gateway|pasarela|provider|payment_gateway|psp",
  authCode: "authorization_code|autorizacion|auth_code|authorizationCode",
  paymentType: "payment_type|tipo_pago|payment_type_code|paymentTypeCode",
  cardLast4: "card_last4|tarjeta|card_number|cardLast4",
};

const FIELD_MAP_LABELS: Record<keyof FieldMapState, string> = {
  orderId: "Orden / folio",
  amount: "Monto",
  currency: "Moneda",
  product: "Producto",
  status: "Estado",
  buyerName: "Nombre",
  buyerDiscordId: "Discord ID",
  date: "Fecha",
  extra: "Detalle extra",
  steam: "Steam",
  email: "Correo",
  server: "Servidor",
  rcon: "Detalle técnico / RCON",
  gateway: "Pasarela",
  authCode: "Autorización",
  paymentType: "Tipo de pago",
  cardLast4: "Tarjeta",
};

const defaultForm: PaymentsState = {
  enabled: false,
  channelId: "",
  sendToChannel: true,
  sendDm: false,
  mentionRoleId: "",
  color: "5dce7a",
  layout: "fields",
  titleTemplate: "{product} · pago confirmado",
  descriptionTemplate: "",
  footerTemplate: "Notificación de pago",
  labelSteam: "Steam",
  labelName: "Nombre",
  labelEmail: "Correo",
  labelOrder: "Orden",
  labelAmount: "Monto",
  labelServer: "Servidor",
  labelRcon: "Detalle técnico",
  labelDiscord: "Discord",
  labelGateway: "Pasarela",
  labelAuth: "Autorización",
  labelPaymentType: "Tipo de pago",
  labelCard: "Tarjeta",
  webhookSecret: "",
  fieldMap: DEFAULT_FIELD_MAP,
  history: [],
};

const defaultManual: ManualForm = {
  orderId: "",
  amount: "",
  currency: "CLP",
  product: "",
  status: "pagado",
  buyerName: "",
  buyerDiscordId: "",
  steam: "",
  email: "",
  server: "",
  rcon: "",
  extra: "",
  sendToChannel: true,
  sendDm: false,
};

const TABS = [
  { id: "config", label: "Configuración" },
  { id: "enviar", label: "Enviar" },
  { id: "api", label: "API / Webhook" },
  { id: "historial", label: "Historial" },
];

function normalizeFieldMap(value: unknown): FieldMapState {
  const data = asRecord(value);
  return {
    orderId: toStringValue(data.orderId, DEFAULT_FIELD_MAP.orderId),
    amount: toStringValue(data.amount, DEFAULT_FIELD_MAP.amount),
    currency: toStringValue(data.currency, DEFAULT_FIELD_MAP.currency),
    product: toStringValue(data.product, DEFAULT_FIELD_MAP.product),
    status: toStringValue(data.status, DEFAULT_FIELD_MAP.status),
    buyerName: toStringValue(data.buyerName, DEFAULT_FIELD_MAP.buyerName),
    buyerDiscordId: toStringValue(data.buyerDiscordId, DEFAULT_FIELD_MAP.buyerDiscordId),
    date: toStringValue(data.date, DEFAULT_FIELD_MAP.date),
    extra: toStringValue(data.extra, DEFAULT_FIELD_MAP.extra),
    steam: toStringValue(data.steam, DEFAULT_FIELD_MAP.steam),
    email: toStringValue(data.email, DEFAULT_FIELD_MAP.email),
    server: toStringValue(data.server, DEFAULT_FIELD_MAP.server),
    rcon: toStringValue(data.rcon, DEFAULT_FIELD_MAP.rcon),
    gateway: toStringValue(data.gateway, DEFAULT_FIELD_MAP.gateway),
    authCode: toStringValue(data.authCode, DEFAULT_FIELD_MAP.authCode),
    paymentType: toStringValue(data.paymentType, DEFAULT_FIELD_MAP.paymentType),
    cardLast4: toStringValue(data.cardLast4, DEFAULT_FIELD_MAP.cardLast4),
  };
}

function normalizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = asRecord(entry);
    return {
      id: toStringValue(row.id),
      at: toStringValue(row.at),
      orderId: toStringValue(row.orderId),
      amount: toStringValue(row.amount),
      product: toStringValue(row.product),
      status: toStringValue(row.status),
      buyerDiscordId: toStringValue(row.buyerDiscordId),
      channelSent: toBooleanValue(row.channelSent),
      dmSent: toBooleanValue(row.dmSent),
      source: toStringValue(row.source, "manual"),
    };
  });
}

function normalizeForm(value: unknown): PaymentsState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId),
    sendToChannel: data.sendToChannel === false ? false : true,
    sendDm: data.sendDm === true,
    mentionRoleId: toStringValue(data.mentionRoleId),
    color: toStringValue(data.color, "5dce7a").replace("#", ""),
    layout: toStringValue(data.layout, "fields") === "text" ? "text" : "fields",
    titleTemplate: toStringValue(data.titleTemplate, defaultForm.titleTemplate),
    descriptionTemplate: toStringValue(data.descriptionTemplate, defaultForm.descriptionTemplate),
    footerTemplate: toStringValue(data.footerTemplate, defaultForm.footerTemplate),
    labelSteam: toStringValue(data.labelSteam, defaultForm.labelSteam),
    labelName: toStringValue(data.labelName, defaultForm.labelName),
    labelEmail: toStringValue(data.labelEmail, defaultForm.labelEmail),
    labelOrder: toStringValue(data.labelOrder, defaultForm.labelOrder),
    labelAmount: toStringValue(data.labelAmount, defaultForm.labelAmount),
    labelServer: toStringValue(data.labelServer, defaultForm.labelServer),
    labelRcon: toStringValue(data.labelRcon, defaultForm.labelRcon),
    labelDiscord: toStringValue(data.labelDiscord, defaultForm.labelDiscord),
    labelGateway: toStringValue(data.labelGateway, defaultForm.labelGateway),
    labelAuth: toStringValue(data.labelAuth, defaultForm.labelAuth),
    labelPaymentType: toStringValue(data.labelPaymentType, defaultForm.labelPaymentType),
    labelCard: toStringValue(data.labelCard, defaultForm.labelCard),
    webhookSecret: toStringValue(data.webhookSecret),
    fieldMap: normalizeFieldMap(data.fieldMap),
    history: normalizeHistory(data.history),
  };
}

export function PaymentsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "payments"), "config", TABS.map((t) => t.id));
  const [form, setForm] = useState<PaymentsState>(defaultForm);
  const [manual, setManual] = useState<ManualForm>(defaultManual);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webhookUrl = useMemo(
    () => `https://eyedbot.eyedcomun.me/api/payment-receipt/webhook/${guildId}`,
    [guildId],
  );

  async function reload() {
    const payload = await getPaymentReceiptConfig(guildId);
    setForm(normalizeForm(payload));
  }

  useEffect(() => {
    void reload()
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave(extra: Record<string, unknown> = {}) {
    if (form.enabled && form.sendToChannel && !form.channelId) {
      toast({ title: "Falta el canal", description: "Selecciona un canal de notificaciones.", tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      const result = asRecord(
        await savePaymentReceiptConfig(guildId, {
          enabled: form.enabled,
          channelId: form.channelId,
          sendToChannel: form.sendToChannel,
          sendDm: form.sendDm,
          mentionRoleId: form.mentionRoleId || null,
          color: form.color,
          layout: form.layout,
          titleTemplate: form.titleTemplate,
          descriptionTemplate: form.descriptionTemplate,
          footerTemplate: form.footerTemplate,
          labelSteam: form.labelSteam,
          labelName: form.labelName,
          labelEmail: form.labelEmail,
          labelOrder: form.labelOrder,
          labelAmount: form.labelAmount,
          labelServer: form.labelServer,
          labelRcon: form.labelRcon,
          labelDiscord: form.labelDiscord,
          labelGateway: form.labelGateway,
          labelAuth: form.labelAuth,
          labelPaymentType: form.labelPaymentType,
          labelCard: form.labelCard,
          webhookSecret: form.webhookSecret,
          fieldMap: form.fieldMap,
          ...extra,
        }),
      );
      const config = asRecord(result.config);
      if (Object.keys(config).length) setForm(normalizeForm(config));
      toast({ title: "Pagos guardados", description: "La configuración de notificaciones quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!manual.product && !manual.amount && !manual.orderId) {
      toast({ title: "Datos incompletos", description: "Indica al menos producto, monto u orden.", tone: "danger" });
      return;
    }
    setSending(true);
    try {
      const result = asRecord(
        await sendPaymentReceipt(guildId, {
          ...manual,
        }),
      );
      const parts = [];
      if (result.channelSent) parts.push("canal");
      if (result.dmSent) parts.push("DM");
      toast({
        title: "Notificación enviada",
        description: parts.length ? `Enviado a: ${parts.join(" y ")}.` : "Enviado.",
        tone: "success",
      });
      await reload();
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Alert title="Cargando pagos" description="Consultando la configuración de notificaciones." />;
  if (error) return <Alert title="No se pudo cargar" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard
        title="Notificaciones de pago"
        description="Avisos de compra al canal (y opcionalmente por DM). Textos, etiquetas y mapeo de API son configurables y se guardan por servidor."
      >
        <Tabs items={TABS} value={tab} onValueChange={setTab} className="mb-5" />

        {tab === "config" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Activar notificaciones</p>
                <p className="text-sm text-zinc-400">Habilita el módulo y el webhook externo.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm((c) => ({ ...c, enabled }))} />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Enviar al canal</p>
                <p className="text-sm text-zinc-400">Publica el comprobante en un canal del servidor.</p>
              </div>
              <Switch
                checked={form.sendToChannel}
                onCheckedChange={(sendToChannel) => setForm((c) => ({ ...c, sendToChannel }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Enviar por DM</p>
                <p className="text-sm text-zinc-400">Manda el mismo embed al Discord ID del comprador.</p>
              </div>
              <Switch checked={form.sendDm} onCheckedChange={(sendDm) => setForm((c) => ({ ...c, sendDm }))} />
            </div>

            <Field label="Canal de notificaciones">
              <ChannelSelect
                value={form.channelId}
                onChange={(channelId) => setForm((c) => ({ ...c, channelId }))}
                options={channels}
              />
            </Field>

            <Field label="Mencionar rol (opcional)">
              <RoleSelect
                value={form.mentionRoleId}
                onChange={(mentionRoleId) => setForm((c) => ({ ...c, mentionRoleId }))}
                options={roles}
                placeholder="Sin mención"
              />
            </Field>

            <Field label="Color del embed">
              <ColorInput value={form.color} onChange={(color) => setForm((c) => ({ ...c, color: color.replace("#", "") }))} />
            </Field>

            <Field label="Diseño del embed">
              <select
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                value={form.layout}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    layout: e.target.value === "text" ? "text" : "fields",
                  }))
                }
              >
                <option value="fields">Campos (Steam, Orden, Monto…)</option>
                <option value="text">Solo texto (plantilla)</option>
              </select>
            </Field>

            <Field label="Título" description="Placeholders: {product} {amount} {currency} {status} {orderId} {buyerName} {steam} {email} {server}">
              <Input value={form.titleTemplate} onChange={(e) => setForm((c) => ({ ...c, titleTemplate: e.target.value }))} />
            </Field>

            <Field label="Descripción" description="Opcional. Con diseño por campos suele dejarse vacía.">
              <Textarea
                value={form.descriptionTemplate}
                onChange={(e) => setForm((c) => ({ ...c, descriptionTemplate: e.target.value }))}
              />
            </Field>

            <Field label="Footer">
              <Input value={form.footerTemplate} onChange={(e) => setForm((c) => ({ ...c, footerTemplate: e.target.value }))} />
            </Field>

            {form.layout === "fields" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Etiqueta Steam">
                  <Input value={form.labelSteam} onChange={(e) => setForm((c) => ({ ...c, labelSteam: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Nombre">
                  <Input value={form.labelName} onChange={(e) => setForm((c) => ({ ...c, labelName: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Correo">
                  <Input value={form.labelEmail} onChange={(e) => setForm((c) => ({ ...c, labelEmail: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Orden">
                  <Input value={form.labelOrder} onChange={(e) => setForm((c) => ({ ...c, labelOrder: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Monto">
                  <Input value={form.labelAmount} onChange={(e) => setForm((c) => ({ ...c, labelAmount: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Servidor">
                  <Input value={form.labelServer} onChange={(e) => setForm((c) => ({ ...c, labelServer: e.target.value }))} />
                </Field>
                <Field label="Etiqueta detalle técnico">
                  <Input value={form.labelRcon} onChange={(e) => setForm((c) => ({ ...c, labelRcon: e.target.value }))} />
                </Field>
                <Field label="Etiqueta Discord">
                  <Input value={form.labelDiscord} onChange={(e) => setForm((c) => ({ ...c, labelDiscord: e.target.value }))} />
                </Field>
                <Field label="Etiqueta pasarela">
                  <Input value={form.labelGateway} onChange={(e) => setForm((c) => ({ ...c, labelGateway: e.target.value }))} />
                </Field>
                <Field label="Etiqueta autorización">
                  <Input value={form.labelAuth} onChange={(e) => setForm((c) => ({ ...c, labelAuth: e.target.value }))} />
                </Field>
                <Field label="Etiqueta tipo de pago">
                  <Input value={form.labelPaymentType} onChange={(e) => setForm((c) => ({ ...c, labelPaymentType: e.target.value }))} />
                </Field>
                <Field label="Etiqueta tarjeta">
                  <Input value={form.labelCard} onChange={(e) => setForm((c) => ({ ...c, labelCard: e.target.value }))} />
                </Field>
              </div>
            ) : null}

            <FormActions onSave={() => void handleSave()} saving={saving} />
          </div>
        ) : null}

        {tab === "enviar" ? (
          <div className="space-y-5">
            <Alert
              title="Envío manual"
              description="Útil para pruebas o compras que no pasen por la API. Si activas DM, necesitas el Discord ID del comprador."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Producto / concepto">
                <Input value={manual.product} onChange={(e) => setManual((c) => ({ ...c, product: e.target.value }))} />
              </Field>
              <Field label="Orden / folio">
                <Input value={manual.orderId} onChange={(e) => setManual((c) => ({ ...c, orderId: e.target.value }))} />
              </Field>
              <Field label="Monto">
                <Input value={manual.amount} onChange={(e) => setManual((c) => ({ ...c, amount: e.target.value }))} />
              </Field>
              <Field label="Moneda">
                <Input value={manual.currency} onChange={(e) => setManual((c) => ({ ...c, currency: e.target.value }))} />
              </Field>
              <Field label="Estado">
                <Input value={manual.status} onChange={(e) => setManual((c) => ({ ...c, status: e.target.value }))} />
              </Field>
              <Field label="Nombre del cliente">
                <Input value={manual.buyerName} onChange={(e) => setManual((c) => ({ ...c, buyerName: e.target.value }))} />
              </Field>
              <Field label="Steam ID">
                <Input value={manual.steam} onChange={(e) => setManual((c) => ({ ...c, steam: e.target.value }))} />
              </Field>
              <Field label="Correo">
                <Input value={manual.email} onChange={(e) => setManual((c) => ({ ...c, email: e.target.value }))} />
              </Field>
              <Field label="Servidor / estado">
                <Input value={manual.server} onChange={(e) => setManual((c) => ({ ...c, server: e.target.value }))} />
              </Field>
              <Field label="Detalle técnico">
                <Input value={manual.rcon} onChange={(e) => setManual((c) => ({ ...c, rcon: e.target.value }))} />
              </Field>
              <Field label="Discord ID (para DM)">
                <Input
                  value={manual.buyerDiscordId}
                  onChange={(e) => setManual((c) => ({ ...c, buyerDiscordId: e.target.value }))}
                  placeholder="399740358101303316"
                />
              </Field>
              <Field label="Detalle extra">
                <Input value={manual.extra} onChange={(e) => setManual((c) => ({ ...c, extra: e.target.value }))} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={manual.sendToChannel}
                  onChange={(e) => setManual((c) => ({ ...c, sendToChannel: e.target.checked }))}
                />
                Canal
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={manual.sendDm}
                  onChange={(e) => setManual((c) => ({ ...c, sendDm: e.target.checked }))}
                />
                DM
              </label>
            </div>
            <Button onClick={() => void handleSend()} disabled={sending}>
              <Send className="mr-2 h-4 w-4" />
              {sending ? "Enviando..." : "Enviar notificación"}
            </Button>
          </div>
        ) : null}

        {tab === "api" ? (
          <div className="space-y-5">
            <Alert
              title="API de comprobantes"
              description="La tienda o API externa puede POST-ear el JSON del pago a esta URL. EyedBot detecta campos comunes o los que configures abajo."
            />
            <Field label="URL del webhook">
              <Input value={webhookUrl} readOnly />
            </Field>
            <Field label="Secreto" description="Header: X-EyedBot-Payment-Secret o Authorization: Bearer ...">
              <Input value={form.webhookSecret} readOnly />
            </Field>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => void handleSave({ rotateWebhookSecret: true })}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Rotar secreto
            </Button>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-zinc-300">
              <p className="mb-2 font-medium text-white">Ejemplo de body</p>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-zinc-400">{`{
  "buyOrder": "VIPmt1yljqw61899a",
  "steamId": "76561198077647066",
  "playerName": "",
  "email": "cliente@correo.com",
  "amount": 50,
  "currency": "CLP",
  "product": "VIP",
  "status": "pagado_activado",
  "server": "Activado en el servidor",
  "rcon": "oxide.usergroup add … vip → Player added to group: vip"
}`}</pre>
            </div>

            <p className="text-sm text-zinc-400">
              Mapeo de campos (separados por <code>|</code>). Admite rutas como <code>data.amount</code>.
            </p>
            {(Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMapState>).map((key) => (
              <Field key={key} label={FIELD_MAP_LABELS[key]}>
                <Input
                  value={form.fieldMap[key]}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      fieldMap: { ...c.fieldMap, [key]: e.target.value },
                    }))
                  }
                />
              </Field>
            ))}
            <FormActions onSave={() => void handleSave()} saving={saving} />
          </div>
        ) : null}

        {tab === "historial" ? (
          <div className="space-y-3">
            {form.history.length === 0 ? (
              <Alert title="Sin envíos aún" description="Cuando mandes un pago manual o llegue un webhook, aparecerá aquí." />
            ) : (
              form.history.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                  <div className="flex items-start gap-3">
                    <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div>
                      <p className="font-medium text-white">
                        {entry.product || "Pago"} · {entry.amount || "—"}
                      </p>
                      <p className="text-zinc-400">
                        {entry.orderId || "sin orden"} · {entry.status || "—"} · {entry.source}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {entry.at} · canal: {entry.channelSent ? "sí" : "no"} · DM: {entry.dmSent ? "sí" : "no"}
                        {entry.buyerDiscordId ? ` · <@${entry.buyerDiscordId}>` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </SectionCard>
    </PaneGrid>
  );
}
