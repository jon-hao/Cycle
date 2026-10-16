/**
 * 月度软配额（UTC 自然月）。计数存在 SSM Standard Parameter（免费）。
 * 故意低于账号 Always Free（100 万次 / 40 万 GB-秒），给本函数 429 与其它用量留余量。
 * 说明：请求已打到 Function URL 时，这次 invoke 仍会计入 AWS 用量；超额后尽早 429，避免金十拉取等重活。
 */

import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

const PARAM = process.env.HAPI_QUOTA_PARAM || "/HApi/quota";
const MAX_REQ = Math.max(1, Number(process.env.HAPI_MAX_REQUESTS || 900000));
const MAX_GB = Math.max(1, Number(process.env.HAPI_MAX_GB_SECONDS || 360000));
const MEMORY_MB = Math.max(
  128,
  Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 128)
);

const ssm = new SSMClient({});

function monthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

function resetDate(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

function empty(ym) {
  return { ym, req: 0, gbSec: 0 };
}

async function readState() {
  const ym = monthKey();
  try {
    const out = await ssm.send(
      new GetParameterCommand({ Name: PARAM })
    );
    const raw = out.Parameter && out.Parameter.Value;
    if (!raw) return empty(ym);
    const data = JSON.parse(raw);
    if (!data || data.ym !== ym) return empty(ym);
    return {
      ym,
      req: Math.max(0, Number(data.req) || 0),
      gbSec: Math.max(0, Number(data.gbSec) || 0),
    };
  } catch (err) {
    if (err && err.name === "ParameterNotFound") return empty(ym);
    throw err;
  }
}

async function writeState(state) {
  await ssm.send(
    new PutParameterCommand({
      Name: PARAM,
      Type: "String",
      Overwrite: true,
      Value: JSON.stringify({
        ym: state.ym,
        req: Math.floor(state.req),
        gbSec: Math.round(state.gbSec * 1000) / 1000,
      }),
    })
  );
}

function gbSecondsFor(durationMs) {
  return (MEMORY_MB / 1024) * (Math.max(0, durationMs) / 1000);
}

function overLimit(state) {
  return state.req >= MAX_REQ || state.gbSec >= MAX_GB;
}

export function quotaLimits() {
  return {
    maxRequests: MAX_REQ,
    maxGbSeconds: MAX_GB,
    memoryMb: MEMORY_MB,
    param: PARAM,
  };
}

export async function quotaStatus() {
  const state = await readState();
  return {
    flow: "quota",
    month: state.ym,
    requests: state.req,
    gbSeconds: Math.round(state.gbSec * 1000) / 1000,
    limits: { requests: MAX_REQ, gbSeconds: MAX_GB },
    remaining: {
      requests: Math.max(0, MAX_REQ - state.req),
      gbSeconds: Math.max(0, Math.round((MAX_GB - state.gbSec) * 1000) / 1000),
    },
    reset: resetDate(state.ym),
    exceeded: overLimit(state),
  };
}

/**
 * 包一层业务逻辑：超额则 ok:false；无论成败都记账（含 429 自身的轻量耗时）。
 * @param {() => Promise<unknown>} work
 */
export async function withQuota(work) {
  const t0 = Date.now();
  let state = await readState();

  if (overLimit(state)) {
    state = {
      ...state,
      req: state.req + 1,
      gbSec: state.gbSec + gbSecondsFor(Date.now() - t0),
    };
    await writeState(state);
    return {
      ok: false,
      reset: resetDate(state.ym),
      usage: {
        requests: state.req,
        gbSeconds: Math.round(state.gbSec * 1000) / 1000,
      },
      limits: { requests: MAX_REQ, gbSeconds: MAX_GB },
    };
  }

  try {
    const result = await work();
    state = {
      ...state,
      req: state.req + 1,
      gbSec: state.gbSec + gbSecondsFor(Date.now() - t0),
    };
    await writeState(state);
    return { ok: true, result };
  } catch (err) {
    state = {
      ...state,
      req: state.req + 1,
      gbSec: state.gbSec + gbSecondsFor(Date.now() - t0),
    };
    try {
      await writeState(state);
    } catch (_) {
      /* 记账失败不掩盖业务错误 */
    }
    throw err;
  }
}
