import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = join(import.meta.dirname, 'workflows');
for (const file of ['notification-dispatch.json', 'pending-notifications.json', 'overdue-reminders.json', 'daily-report.json']) {
  const workflow = JSON.parse(await readFile(join(directory, file), 'utf8'));
  const names = new Set(workflow.nodes.map((node) => node.name));
  if (names.size !== workflow.nodes.length) throw new Error(`${file}: duplicate node name`);
  if (workflow.active !== false) throw new Error(`${file}: import must be inactive`);
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    if (!names.has(source)) throw new Error(`${file}: missing source ${source}`);
    for (const branch of outputs.main) {
      for (const edge of branch) {
        if (!names.has(edge.node)) throw new Error(`${file}: missing target ${edge.node}`);
      }
    }
  }
  for (const step of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
    new Function(step.parameters.jsCode);
  }
  console.log(`${file}: ${workflow.nodes.length} nodes and valid embedded JavaScript`);
}
