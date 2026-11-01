import {
  probeOllama,
  OllamaProbeError,
  prepareSyntheticInference,
  runSyntheticInference,
  SyntheticInferenceError,
} from './index.js';

async function inferenceMain(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  const invalid = () =>
    new SyntheticInferenceError('inference_invalid_options');
  if (action !== 'preview' && action !== 'run') throw invalid();
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!flag || values.has(flag) || flags.has(flag)) throw invalid();
    if (['--allow-inference', '--allow-local-probe'].includes(flag)) {
      flags.add(flag);
      continue;
    }
    if (
      !['--endpoint', '--model', '--payload-sha256', '--timeout-ms'].includes(
        flag,
      )
    )
      throw invalid();
    const value = rest[++i];
    if (!value || value.startsWith('--')) throw invalid();
    values.set(flag, value);
  }
  const endpoint = values.get('--endpoint');
  const model = values.get('--model');
  if (!endpoint || !model) throw invalid();
  const preview = prepareSyntheticInference({ endpoint, model });
  if (action === 'preview') {
    if (values.size !== 2 || flags.size) throw invalid();
    process.stdout.write(`${JSON.stringify(preview)}\n`);
    return;
  }
  const hash = values.get('--payload-sha256');
  const timeout = values.get('--timeout-ms') ?? '30000';
  if (
    !hash ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    flags.size !== 2 ||
    !/^[1-9]\d{0,5}$/.test(timeout) ||
    String(Number(timeout)) !== timeout
  )
    throw invalid();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const report = await runSyntheticInference(
      preview,
      {
        canInfer: true,
        allowLocalProbe: true,
        endpoint,
        model,
        payloadSha256: hash,
      },
      { timeoutMs: Number(timeout), signal: controller.signal },
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'infer') return inferenceMain(args);
  if (
    command !== 'probe' ||
    args.filter((arg) => arg === '--allow-local-probe').length !== 1
  )
    throw new OllamaProbeError('probe_invalid_options');
  const rest = args.filter((arg) => arg !== '--allow-local-probe');
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (
      !flag ||
      !value ||
      !['--endpoint', '--timeout-ms'].includes(flag) ||
      options.has(flag)
    )
      throw new OllamaProbeError('probe_invalid_options');
    options.set(flag, value);
  }
  const endpoint = options.get('--endpoint');
  const timeout = options.get('--timeout-ms') ?? '3000';
  if (!endpoint || !/^[1-9]\d{0,4}$/.test(timeout))
    throw new OllamaProbeError('probe_invalid_options');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const report = await probeOllama({
      endpoint,
      allowLocalProbe: true,
      timeoutMs: Number(timeout),
      signal: controller.signal,
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

await main().catch((error: unknown) => {
  if (error instanceof SyntheticInferenceError) {
    process.stderr.write(
      `${JSON.stringify({ error: { code: error.code, requestDispatched: error.requestDispatched, outcome: error.outcome } })}\n`,
    );
    process.exitCode =
      error.outcome === 'unknown'
        ? 2
        : error.code === 'inference_cancelled'
          ? 130
          : 1;
    return;
  }
  const code =
    error instanceof OllamaProbeError ? error.code : 'probe_invalid_options';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = code === 'probe_cancelled' ? 130 : 1;
});
