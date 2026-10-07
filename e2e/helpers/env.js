/**
 * 跑前环境自检 —— 尤其是**数据安全**那一条。
 *
 * 背景：application/src/config/index.ts 的兜底值是 `'https://ai-etf.xyz'`（**生产**）。
 * 它的设计意图是「忘配环境变量时行为与改动前一致」，但对 E2E 来说意味着：
 * `.env.development` 缺失、没配 `VITE_API_BASE`、或换了构建模式，
 * **测试就会真的去写生产库**。
 *
 * 所以每条 E2E 用例开跑前都必须先确认「产物打的是本地后端」。
 * 这里把它做成断言，而不是靠人记得跑之前 grep 一下（08-实测记录 §4 step 0 是手工版）。
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../../dist/dev/mp-weixin');

/** 从构建产物里读出实际编译进去的 API_BASE。 */
function readBuiltApiBase() {
  const configPath = path.join(DIST_DIR, 'config/index.js');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `找不到构建产物 ${configPath}\n` +
        '→ 先跑一次编译（jest 的 testEnvironmentOptions.compile=true 会在首次运行时生成），' +
        '或手工执行 npm run dev:mp-weixin。'
    );
  }
  const source = fs.readFileSync(configPath, 'utf8');
  const match = /const API_BASE\s*=\s*"([^"]*)"/.exec(source);
  if (!match) {
    throw new Error(
      `在 ${configPath} 里没找到 \`const API_BASE = "..."\`。\n` +
        '→ 构建产物的形式可能变了，请重新确认 src/config/index.ts 的编译结果。'
    );
  }
  return match[1];
}

/**
 * 数据安全闸门：产物不是打本地后端就直接抛。
 *
 * 允许的地址：localhost / 127.0.0.1 / [::1]。
 * 只要不是这三个，一律当成「会打到生产」拦下来 —— 宁可误杀也不能真写生产库。
 */
function assertLocalApiBase() {
  const base = readBuiltApiBase();
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(base);
  if (!isLocal) {
    throw new Error(
      `⛔ 构建产物打的是【非本地】后端，E2E 拒绝运行。\n` +
        `   产物里的 API_BASE = "${base}"\n` +
        '   期望 http://localhost:8000\n' +
        '→ 这多半意味着请求会打到生产库（src/config/index.ts 的兜底值就是生产地址）。\n' +
        '→ 处理：确认 .env.development 里有 VITE_API_BASE=http://localhost:8000，然后重新编译。'
    );
  }
  return base;
}

/** 读产物里的 project.config.json（uni 构建时生成，appid 取自 src/manifest.json）。 */
function readBuiltProjectConfig() {
  const p = path.join(DIST_DIR, 'project.config.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 读产物里的 project.private.config.json。
 *
 * 它由 uni 从 `src/project.private.config.json` 拷贝而来
 * （@dcloudio/uni-mp-weixin/dist/uni.compiler.js:211-232 的 copyOptions.targets
 *  里列了这个文件名，src 是相对【编译入口目录】= src/ 解析的）。
 *
 * ⚠️ 放在仓库根目录不算数 —— 编译入口目录是 src/，根目录那份不会进产物，
 * 开发者工具也就读不到。这一点是实测出来的，别想当然。
 */
function readBuiltPrivateConfig() {
  const p = path.join(DIST_DIR, 'project.private.config.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 开发者工具**实际生效**的项目配置 = project.config.json 被 project.private.config.json 覆盖。
 * 这是微信开发者工具自己的合并规则（private 是「个人设置，不进版本库」用的），
 * 所以断言必须看合并后的结果，而不是只看生成的 project.config.json。
 */
function readEffectiveProjectConfig() {
  const base = readBuiltProjectConfig();
  const priv = readBuiltPrivateConfig();
  if (!base && !priv) return null;
  return Object.assign({}, base || {}, priv || {}, {
    setting: Object.assign({}, (base || {}).setting, (priv || {}).setting),
  });
}

/**
 * `urlCheck` 必须是 false（08-实测记录 §3.4），否则小程序会拦掉 http://localhost:8000。
 * 看的是**合并后**的值 —— 改 dist 里的文件没用（每次构建重新生成），
 * 要改 `src/project.private.config.json`（或 src/manifest.json，二选一，见下）。
 */
function assertUrlCheckDisabled() {
  const cfg = readEffectiveProjectConfig();
  if (!cfg) return { checked: false, reason: '读不到产物里的 project*.config.json' };
  const urlCheck = cfg.setting && cfg.setting.urlCheck;
  if (urlCheck !== false) {
    throw new Error(
      `⛔ 生效后的 setting.urlCheck = ${JSON.stringify(urlCheck)}，应为 false。\n` +
        '→ 改 dist 里的文件无效（每次构建重新生成）。正确做法是把 urlCheck:false 写进\n' +
        '   src/project.private.config.json（推荐，不动 manifest.json），\n' +
        '   或写进 src/manifest.json 的 mp-weixin.setting.urlCheck。'
    );
  }
  return { checked: true, urlCheck };
}

/**
 * appid 必须是 touristappid。
 *
 * 真 appid（src/manifest.json 里的 wx4345af65c586dd70）在本机**根本打不开项目**：
 * 开发者工具会去校验登录账号对该小程序的权限，本机账号没权限，直接
 * `错误 登录用户不是该小程序的开发者 (code 10)`，然后 CLI 退出 →
 * uni-automator 报 "Failed to launch Wechat web DevTools, please make sure http port is open"，
 * 看起来像端口问题，其实是权限问题，排查成本很高。所以这里提前拦一道。
 */
function assertTouristAppId() {
  const cfg = readEffectiveProjectConfig();
  if (!cfg) return { checked: false, reason: '读不到产物里的 project*.config.json' };
  if (cfg.appid !== 'touristappid') {
    throw new Error(
      `⛔ 生效后的 appid = ${JSON.stringify(cfg.appid)}，应为 "touristappid"。\n` +
        '→ 真 appid 会触发开发者工具的权限校验，本机账号无权限，项目打不开。\n' +
        '   （现象：Failed to launch Wechat web DevTools, please make sure http port is open）\n' +
        '→ 处理：在 src/project.private.config.json 里写 "appid": "touristappid"。'
    );
  }
  return { checked: true, appid: cfg.appid };
}

module.exports = {
  DIST_DIR,
  readBuiltApiBase,
  assertLocalApiBase,
  readBuiltProjectConfig,
  readBuiltPrivateConfig,
  readEffectiveProjectConfig,
  assertUrlCheckDisabled,
  assertTouristAppId,
};
