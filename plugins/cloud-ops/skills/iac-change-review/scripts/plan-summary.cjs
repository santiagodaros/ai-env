#!/usr/bin/env node
// Resume un plan de Terraform o un what-if de ARM/Bicep y marca lo que una persona tiene que mirar antes de aplicar.
// Entrada (JSON):
//   Terraform   terraform plan -out tfplan && terraform show -json tfplan > plan.json
//   Bicep/ARM   az deployment group what-if ... --no-pretty-print > whatif.json
// Uso: node plan-summary.cjs <archivo.json> [--json]
// Salida: 0 sin alertas altas · 3 hay alertas altas (parada humana) · 1 entrada ilegible.
// Nunca imprime valores de atributos salvo una lista corta de nombres inofensivos (SKU, rol, acceso de red):
// un plan puede traer secretos en `after`.
const fs = require('fs');
const file = process.argv[2];
const asJson = process.argv.includes('--json');
const die = (m) => { console.error('RECHAZADO: ' + m); process.exit(1); };
if (!file || file.startsWith('--')) die('falta el archivo JSON del plan o del what-if.');

let data;
try {
  const buf = fs.readFileSync(file);
  // PowerShell 5.1 escribe UTF-16 con `>`: se detecta por el BOM o por los bytes nulos.
  const utf16 = (buf[0] === 0xff && buf[1] === 0xfe) || (buf.length > 3 && buf[1] === 0 && buf[3] === 0);
  data = JSON.parse(buf.toString(utf16 ? 'utf16le' : 'utf8').replace(/^﻿/, ''));
} catch (e) { die(`no pude leer ${file} como JSON (${e.message}). ¿Es la salida de "terraform show -json" o de "what-if --no-pretty-print"?`); }

// Recursos donde borrar o reemplazar significa perder datos o dejar algo sin servicio.
const STATEFUL = /^(azurerm_(storage_(account|container|share)|mssql_|sql_|postgresql_|mysql_|mariadb_|cosmosdb_|key_vault$|key_vault_(key|secret|certificate)|recovery_services_vault|backup_|data_protection_|managed_disk|log_analytics_workspace|kubernetes_cluster|(linux_|windows_)?virtual_machine(_scale_set)?$|redis_cache|servicebus_namespace|eventhub_namespace|container_registry|resource_group$|subscription$|dns_zone|private_dns_zone)|aws_(s3_bucket$|db_instance|rds_cluster|dynamodb_table|ebs_volume|efs_file_system|kms_key|instance$)|google_(storage_bucket$|sql_database|bigquery_dataset|compute_disk|compute_instance$|kms_))|^Microsoft\.(Storage\/storageAccounts|Sql\/|DBfor|DocumentDB\/|KeyVault\/vaults|RecoveryServices\/vaults|DataProtection\/|Compute\/(disks|virtualMachines)|OperationalInsights\/workspaces|ContainerService\/managedClusters|ContainerRegistry\/registries|Cache\/|ServiceBus\/namespaces|EventHub\/namespaces|Resources\/resourceGroups|Network\/(dnsZones|privateDnsZones))/i;
const PERMS = /^(azurerm_role_(assignment|definition)|azurerm_key_vault_access_policy|azurerm_(user_assigned_identity|federated_identity_credential)|azuread_.*(role|credential|password|certificate|owner|member|consent|permission)|aws_iam_|google_.*_iam_)|^Microsoft\.(Authorization\/role(Assignments|Definitions)|ManagedIdentity\/)/i;
const GOVERN = /^(azurerm_management_lock|azurerm_.*policy_(assignment|exemption|definition|set_definition)|azurerm_.*_policy_remediation)|^Microsoft\.Authorization\/(locks|policy(Assignments|Exemptions|Definitions|SetDefinitions))/i;
const NETWORK = /^(azurerm_(network_security_(rule|group)|public_ip|.*firewall.*rule.*|firewall_policy_rule_collection_group|route(_table)?$|virtual_network_peering|private_endpoint|bastion_host)|aws_(security_group|vpc_security_group_|network_acl)|google_compute_firewall)|^Microsoft\.Network\/(networkSecurityGroups|publicIPAddresses|azureFirewalls|firewallPolicies|routeTables|virtualNetworks\/virtualNetworkPeerings|privateEndpoints)|firewallRules|ipRules/i;
// Atributos cuyo valor sí se puede mostrar y que cambian la exposición o el costo.
const SHOW = /^(sku|sku_name|sku_tier|tier|size|vm_size|capacity|account_tier|account_replication_type|role_definition_name|principal_type|scope_type|lock_level|public_network_access_enabled|public_network_access|publicNetworkAccess|allow_blob_public_access|allow_nested_items_to_be_public|allowBlobPublicAccess|access|direction|source_address_prefix|destination_port_range|start_ip_address|end_ip_address|min_tls_version|minimumTlsVersion|https_only|enable_rbac_authorization|purge_protection_enabled|soft_delete_retention_days|location)$/i;
const OPEN = /^(\*|0\.0\.0\.0(\/0)?|internet|any)$/i;
const BROAD_ROLE = /^(owner|contributor|user access administrator|role based access control administrator)$/i;

const items = []; // { action, address, type, notes[] }
const alerts = []; // { sev: 'alta'|'media', address, msg }
const alert = (sev, address, msg) => alerts.push({ sev, address, msg });
const scalar = (v) => (v === null || ['string', 'number', 'boolean'].includes(typeof v) ? String(v) : null);

function judge(action, address, type, before, after, notes) {
  if ((action === 'destruir' || action === 'reemplazar') && STATEFUL.test(type)) alert('alta', address, `${action} un recurso con datos o del que dependen otros (${type})`);
  else if ((action === 'destruir' || action === 'reemplazar') && !GOVERN.test(type) && !PERMS.test(type)) alert('media', address, `${action} ${type}`);
  if (PERMS.test(type) && action !== 'sin cambios') {
    const role = after && scalar(after.role_definition_name);
    alert(role && BROAD_ROLE.test(role) ? 'alta' : 'media', address, `cambia permisos o identidad (${action}${role ? `, rol ${role}` : ''})`);
  }
  if (GOVERN.test(type) && action !== 'sin cambios') alert(action === 'destruir' || action === 'reemplazar' ? 'alta' : 'media', address, `cambia gobierno: lock o policy (${action})`);
  if (NETWORK.test(type) && action !== 'sin cambios' && action !== 'destruir') alert('media', address, `cambia la exposición de red (${action})`);
  for (const [k, b, a] of notes) {
    if (/public.?network.?access|allow.?blob.?public|nested_items_to_be_public/i.test(k) && /^(true|enabled)$/i.test(a) && !/^(true|enabled)$/i.test(b || '')) alert('alta', address, `habilita acceso público (${k}: ${b ?? 'sin valor'} → ${a})`);
    if (/^(source_address_prefix|start_ip_address)$/i.test(k) && OPEN.test(a || '') && !(after && /deny/i.test(String(after.access || '')))) alert('alta', address, `abre el origen a cualquiera (${k}: ${a})`);
    if (/^(sku|sku_name|sku_tier|tier|size|vm_size|capacity|account_replication_type)$/i.test(k) && b !== null && b !== a) alert('media', address, `cambia tamaño o SKU, con impacto en costo (${k}: ${b} → ${a})`);
    if (/purge_protection_enabled|enable_rbac_authorization|https_only/i.test(k) && /^true$/i.test(b || '') && /^false$/i.test(a || '')) alert('alta', address, `desactiva una protección (${k}: true → false)`);
  }
}

let kind;
if (Array.isArray(data.resource_changes)) {
  kind = 'Terraform';
  for (const rc of data.resource_changes) {
    const acts = (rc.change && rc.change.actions) || [];
    const action = acts.includes('delete') && acts.includes('create') ? 'reemplazar' : acts.includes('delete') ? 'destruir' : acts.includes('create') ? 'crear' : acts.includes('update') ? 'modificar' : acts.includes('read') ? 'leer' : 'sin cambios';
    if (action === 'leer') continue;
    const before = (rc.change && rc.change.before) || {}, after = (rc.change && rc.change.after) || {};
    const notes = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!SHOW.test(k)) continue;
      const b = scalar(before[k] === undefined ? null : before[k]), a = scalar(after[k] === undefined ? null : after[k]);
      if (b === null && a === null) continue;
      if (action !== 'crear' && action !== 'destruir' && b === a) continue;
      notes.push([k, action === 'crear' ? null : b, a]);
    }
    // Reglas de NSG escritas dentro del grupo (bloques security_rule).
    for (const r of Array.isArray(after.security_rule) ? after.security_rule : []) {
      if (r && /allow/i.test(String(r.access)) && /inbound/i.test(String(r.direction)) && OPEN.test(String(r.source_address_prefix || ''))) alert('alta', rc.address, `regla de entrada abierta a cualquiera (puerto ${scalar(r.destination_port_range) || 'varios'})`);
    }
    items.push({ action, address: rc.address, type: rc.type, notes });
    judge(action, rc.address, rc.type, before, after, notes);
  }
} else if (Array.isArray(data.changes)) {
  kind = 'what-if de ARM/Bicep';
  const map = { create: 'crear', delete: 'destruir', modify: 'modificar', deploy: 'desplegar', nochange: 'sin cambios', ignore: 'sin cambios', unsupported: 'no evaluado' };
  for (const ch of data.changes) {
    const id = String(ch.resourceId || '');
    const m = id.match(/\/providers\/(Microsoft\.[^/]+)\/(.+)$/i);
    let type = 'desconocido', name = id.split('/').pop();
    if (m) { const parts = m[2].split('/'); type = m[1] + '/' + parts.filter((_, i) => i % 2 === 0).join('/'); name = parts.filter((_, i) => i % 2 === 1).join('/'); }
    else if (/\/resourceGroups\/[^/]+$/i.test(id)) type = 'Microsoft.Resources/resourceGroups';
    const action = map[String(ch.changeType || '').toLowerCase()] || String(ch.changeType || 'desconocido');
    const address = `${type} ${name}`;
    const notes = [];
    const walk = (deltas, prefix) => { for (const d of deltas || []) {
      const p = prefix ? `${prefix}.${d.path}` : String(d.path || ''); const leaf = /(^|\.)sku\.(name|tier|capacity|size)$/i.test(p) ? 'sku' : p.split('.').pop();
      if (d.children && d.children.length) walk(d.children, p);
      else if (SHOW.test(leaf)) notes.push([leaf, scalar(d.before === undefined ? null : d.before), scalar(d.after === undefined ? null : d.after)]);
      if (/securityRules|firewallRules|ipRules|virtualNetworkRules/i.test(p) && !notes.some((n) => n[0] === 'reglas de red')) notes.push(['reglas de red', null, 'cambian']);
    } };
    walk(ch.delta, '');
    const after = (ch.after && ch.after.properties) || {};
    if (action === 'crear') for (const k of Object.keys(after)) if (SHOW.test(k) && scalar(after[k]) !== null) notes.push([k, null, scalar(after[k])]);
    items.push({ action, address, type, notes });
    judge(action, address, type, {}, after, notes);
    if (notes.some((n) => n[0] === 'reglas de red')) alert('media', address, 'cambian reglas de red o de firewall: revisar orígenes y puertos');
    if (action === 'no evaluado') alert('media', address, 'what-if no pudo evaluar este recurso: revisarlo a mano');
  }
} else die('el JSON no parece un plan de Terraform (falta resource_changes) ni un what-if (falta changes).');

const count = (a) => items.filter((i) => i.action === a).length;
const counts = { crear: count('crear'), modificar: count('modificar') + count('desplegar'), reemplazar: count('reemplazar'), destruir: count('destruir'), 'sin cambios': count('sin cambios'), 'no evaluado': count('no evaluado') };
const uniq = []; for (const a of alerts) if (!uniq.some((u) => u.address === a.address && u.msg === a.msg)) uniq.push(a);
const altas = uniq.filter((a) => a.sev === 'alta'), medias = uniq.filter((a) => a.sev === 'media');
const verdict = altas.length ? 'PARAR' : medias.length ? 'REVISAR' : 'SIN ALERTAS';

if (asJson) { console.log(JSON.stringify({ kind, counts, verdict, alta: altas, media: medias, changes: items.filter((i) => i.action !== 'sin cambios').map((i) => ({ action: i.action, address: i.address, type: i.type })) }, null, 2)); process.exit(altas.length ? 3 : 0); }

const out = [`# Resumen del cambio (${kind})`, '',
  `Crear ${counts.crear} · Modificar ${counts.modificar} · Reemplazar ${counts.reemplazar} · Destruir ${counts.destruir} · Sin cambios ${counts['sin cambios']}${counts['no evaluado'] ? ` · No evaluados ${counts['no evaluado']}` : ''}`, '',
  `Veredicto: ${verdict}${altas.length ? ` — ${altas.length} alerta(s) alta(s): no aplicar sin el visto bueno explícito de la persona` : medias.length ? ` — ${medias.length} punto(s) a revisar` : ''}`, ''];
if (altas.length) out.push('## Alertas altas', ...altas.map((a) => `- ${a.address}: ${a.msg}`), '');
if (medias.length) out.push('## A revisar', ...medias.map((a) => `- ${a.address}: ${a.msg}`), '');
const changed = items.filter((i) => i.action !== 'sin cambios');
if (changed.length) {
  out.push('## Cambios');
  for (const a of ['destruir', 'reemplazar', 'modificar', 'desplegar', 'crear', 'no evaluado']) {
    const g = changed.filter((i) => i.action === a); if (!g.length) continue;
    out.push(`### ${a[0].toUpperCase() + a.slice(1)} (${g.length})`);
    for (const i of g.slice(0, 60)) out.push(`- ${i.address}${i.notes.length ? ' — ' + i.notes.slice(0, 6).map(([k, b, v]) => (b === null || b === undefined ? `${k}: ${v}` : `${k}: ${b} → ${v}`)).join(', ') : ''}`);
    if (g.length > 60) out.push(`- … y ${g.length - 60} más`);
  }
  out.push('');
} else out.push('No hay cambios para aplicar.', '');
out.push('El archivo del plan puede contener secretos: no lo commitees y borralo después de aplicar.');
console.log(out.join('\n'));
process.exit(altas.length ? 3 : 0);
