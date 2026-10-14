import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = join(import.meta.dirname, 'workflows');
const uuid = (value) => {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const node = (workflow, name, type, typeVersion, position, parameters, extra = {}) => ({
  id: uuid(`${workflow}/${name}`), name, type: `n8n-nodes-base.${type}`,
  typeVersion, position, parameters, ...extra,
});
function sequence(nodes) {
  const connections = {};
  for (let index = 0; index < nodes.length - 1; index += 1) {
    connections[nodes[index].name] = { main: [[{ node: nodes[index + 1].name, type: 'main', index: 0 }]] };
  }
  return connections;
}
const bearer = (variable) => ({
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Authorization', value: `=Bearer {{$env.${variable}}}` }] },
});
const postJson = (url, body, variable) => ({
  method: 'POST', url, ...bearer(variable),
  sendBody: true, specifyBody: 'json', jsonBody: body,
  options: { timeout: 15000 },
});
const workflow = (name, nodes, settings = {}) => ({
  name, nodes, connections: sequence(nodes), active: false, pinData: {},
  settings: { executionOrder: 'v1', timezone: 'Asia/Jakarta', ...settings },
  meta: { templateCredsSetupCompleted: false }, tags: [],
});

const dispatchName = 'Satria - Dispatch notification';
const dispatchNodes = [
  node(dispatchName, 'Notification webhook', 'webhook', 2.1, [240, 300], {
    httpMethod: 'POST', path: 'satria-notifications', authentication: 'none',
    responseMode: 'onReceived', options: {},
  }, { webhookId: uuid('satria-notifications-webhook') }),
  node(dispatchName, 'Validate notification ID', 'code', 2, [460, 300], {
    jsCode: `const request = $input.first().json;
const provided = request.headers?.['x-satria-webhook-token'];
if (!provided || provided !== $env.SATRIA_WEBHOOK_TOKEN) throw new Error('Unauthorized webhook');
const body = request.body ?? {};
const id = Number(body.notification_id);
if (!Number.isSafeInteger(id) || id < 1) throw new Error('notification_id must be a positive integer');
return [{ json: { notification_id: id } }];`,
  }),
  node(dispatchName, 'Claim notification', 'httpRequest', 4.2, [680, 300], {
    ...postJson(
      "={{$env.SATRIA_API_BASE + '/api/v1/internal/notifications/' + $json.notification_id + '/claim'}}",
      '={{JSON.stringify({})}}', 'SATRIA_INTERNAL_TOKEN',
    ),
  }),
  node(dispatchName, 'Only claimed', 'code', 2, [900, 300], {
    jsCode: `const claim = $input.first().json;
if (claim.claimed !== true || !claim.notification) return [];
const item = claim.notification;
if (!['MOCK', 'LIVE'].includes(item.delivery_mode) || item.channel !== 'TELEGRAM') {
  throw new Error('Unsupported notification mode or channel');
}
return [{ json: item }];`,
  }),
  node(dispatchName, 'Send via adapter', 'httpRequest', 4.2, [1120, 300], {
    ...postJson(
      "={{($json.sender_profile === 'COURIER' ? $env.SATRIA_COURIER_ADAPTER_URL : $env.SATRIA_ADAPTER_URL) + '/send'}}",
      "={{JSON.stringify({request_id:String($json.id),mode:$json.delivery_mode,peer_id:$json.peer_id,phone:$json.phone,text:$json.message,sender_profile:$json.sender_profile})}}",
      'SATRIA_ADAPTER_TOKEN',
    ),
    headerParameters: { parameters: [{ name: 'Authorization', value: "=Bearer {{$json.sender_profile === 'COURIER' ? $env.SATRIA_COURIER_ADAPTER_TOKEN : $env.SATRIA_ADAPTER_TOKEN}}" }] },
    options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } },
  }, { onError: 'continueRegularOutput' }),
  node(dispatchName, 'Normalize send result', 'code', 2, [1340, 300], {
    jsCode: `const raw = $input.first().json;
let body = raw.body ?? raw;
if (typeof body === 'string') {
  try { body = JSON.parse(body); } catch { body = { error: body }; }
}
const source = $('Only claimed').first().json;
const live = source.delivery_mode === 'LIVE';
const sent = live && body.ok === true && body.status === 'SENT' && body.provider_message_id && body.sent_at;
const simulated = !live && body.ok === true && body.status === 'SIMULATED';
const status = sent ? 'SENT' : simulated ? 'SIMULATED' : 'FAILED';
return [{ json: {
  notification_id: source.id,
  status,
  provider_message_id: sent ? String(body.provider_message_id) : null,
  sent_at: sent ? body.sent_at : null,
  destination: live ? String(source.peer_id ?? source.phone ?? '') : null,
  error: status === 'FAILED' ? String(body.error?.message ?? body.error ?? ('Adapter HTTP ' + (raw.statusCode ?? 'unknown'))) : null,
} }];`,
  }),
  node(dispatchName, 'Record result in Laravel', 'httpRequest', 4.2, [1560, 300], {
    ...postJson(
      "={{$env.SATRIA_API_BASE + '/api/v1/internal/notifications/' + $json.notification_id + '/result'}}",
      '={{JSON.stringify({status:$json.status,provider_message_id:$json.provider_message_id,sent_at:$json.sent_at,destination:$json.destination,error:$json.error})}}',
      'SATRIA_INTERNAL_TOKEN',
    ),
    headerParameters: { parameters: [
      { name: 'Authorization', value: '=Bearer {{$env.SATRIA_INTERNAL_TOKEN}}' },
      { name: 'Idempotency-Key', value: '={{"notification-result-" + $json.notification_id + "-" + $json.status}}' },
    ] },
  }),
];

const overdueName = 'Satria - Remind overdue tasks';
const overdueNodes = [
  node(overdueName, 'Every minute', 'scheduleTrigger', 1.2, [240, 300], {
    rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] },
  }),
  node(overdueName, 'Get overdue tasks', 'httpRequest', 4.2, [460, 300], {
    url: "={{$env.SATRIA_API_BASE + '/api/v1/internal/tasks/overdue'}}",
    ...bearer('SATRIA_INTERNAL_TOKEN'), options: { timeout: 10000 },
  }),
  node(overdueName, 'One item per task', 'code', 2, [680, 300], {
    jsCode: `const tasks = $input.first().json.tasks ?? [];
if (!Array.isArray(tasks)) throw new Error('tasks must be an array');
return tasks.filter(task => Number.isSafeInteger(Number(task.id)) && Number(task.id) > 0 &&
    ['pickup_assignment', 'delivery_run'].includes(task.type))
  .map(task => ({ json: { id: Number(task.id), type: task.type } }));`,
  }),
  node(overdueName, 'Remind through Laravel', 'httpRequest', 4.2, [900, 300], {
    ...postJson(
      "={{$env.SATRIA_API_BASE + '/api/v1/internal/tasks/' + $json.id + '/remind'}}",
      '={{JSON.stringify({type:$json.type})}}', 'SATRIA_INTERNAL_TOKEN',
    ),
  }),
];

const sweepName = 'Satria - Recover pending notifications';
const sweepNodes = [
  node(sweepName, 'Check every minute', 'scheduleTrigger', 1.2, [240, 300], {
    rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] },
  }),
  node(sweepName, 'Get pending notifications', 'httpRequest', 4.2, [460, 300], {
    url: "={{$env.SATRIA_API_BASE + '/api/v1/internal/notifications/pending'}}",
    ...bearer('SATRIA_INTERNAL_TOKEN'), options: { timeout: 10000 },
  }),
  node(sweepName, 'One item per notification', 'code', 2, [680, 300], {
    jsCode: `const notifications = $input.first().json.notifications ?? [];
if (!Array.isArray(notifications)) throw new Error('notifications must be an array');
return notifications.filter(item => Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0)
  .map(item => ({ json: { notification_id: Number(item.id) } }));`,
  }),
  node(sweepName, 'Dispatch through existing webhook', 'httpRequest', 4.2, [900, 300], {
    method: 'POST', url: '={{$env.SATRIA_N8N_WEBHOOK_URL}}',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'X-Satria-Webhook-Token', value: '={{$env.SATRIA_WEBHOOK_TOKEN}}' },
    ] },
    sendBody: true, specifyBody: 'json',
    jsonBody: '={{JSON.stringify({notification_id:$json.notification_id})}}',
    options: { timeout: 10000 },
  }),
];

const reportName = 'Satria - Daily report';
const reportNodes = [
  node(reportName, 'Every day at 17 WIB', 'scheduleTrigger', 1.2, [240, 300], {
    rule: { interval: [{ field: 'cronExpression', expression: '0 17 * * *' }] },
  }),
  node(reportName, 'Generate report in Laravel', 'httpRequest', 4.2, [460, 300], {
    ...postJson(
      "={{$env.SATRIA_API_BASE + '/api/v1/internal/reports/daily'}}",
      '={{JSON.stringify({})}}', 'SATRIA_INTERNAL_TOKEN',
    ),
  }),
];

for (const [file, data] of [
  ['notification-dispatch.json', workflow(dispatchName, dispatchNodes)],
  ['pending-notifications.json', workflow(sweepName, sweepNodes)],
  ['overdue-reminders.json', workflow(overdueName, overdueNodes)],
  ['daily-report.json', workflow(reportName, reportNodes)],
]) {
  await writeFile(join(output, file), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${file}`);
}
