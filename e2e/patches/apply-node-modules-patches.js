// ============================================================================
// E2E 前置补丁：给 node_modules 里两个文件打 4 处小改动
// ----------------------------------------------------------------------------
// 为什么需要这个脚本
//
// uni-automator 启动微信开发者工具的方式，是在 Windows 上 spawn 那个 `cli.bat`。
// 从 Node 18.20.2 / 20.12.2 / 22 起，Node 为堵 BatBadBut 漏洞（CVE-2024-27980）
// 改了行为：不带 `shell: true` 去 spawn `.bat` / `.cmd` 会直接抛 EINVAL。
// 本机 Node 是 v22.21.0，正好在这条线上 → 原生状态跑不起来。
//
// 补上 `shell: true` 之后命令字符串会过一遍 cmd.exe，于是路径里的空格和中文
// 必须自己加引号（本机路径是 `D:\C1\Have a try\...`，两样都占）。
// 所以这 4 处改动是一套的，不能只挑一半。
//
// 这些都只影响 automator 启动开发者工具那条路 —— 也就是只有跑 E2E 才走到。
// 日常的 `npm run dev:mp-weixin` / `build:mp-weixin` 完全不碰这两个文件。
// 所以我们**故意不做 postinstall 钩子**：不该让不跑 E2E 的人也承担这个副作用。
// 唯一的自动入口是 `npm run test:e2e`，它会在开跑前先把本脚本跑一遍。
//
// 两个被改的文件都是压缩过的超长单行 JS（uni.automator.js 只有 2 行，
// index.js 16 行），按行做 diff/patch 没有意义，所以这里用**精确整串替换**：
// 每处改动的「改前」「改后」都是完整写死的，找不到就报错退出，绝不模糊匹配。
//
// 本脚本是**幂等**的：已经打过就跳过；发现是「打了但内容对不上」才报错。
// 用法：
//   node e2e/patches/apply-node-modules-patches.js          打补丁
//   node e2e/patches/apply-node-modules-patches.js --check   只检查，不写文件
// ============================================================================

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..') // e2e/patches/ -> application/
const EXPECT_CHECK = process.argv.includes('--check')

// 每处的意义都写进 why，方便以后有人问「这行引号是干嘛的」
const PATCHES = [
  {
    file: '@dcloudio/uni-mp-weixin/lib/uni.automator.js',
    edits: [
      {
        from: 'const t={stdio:"ignore",detached:!0}',
        to: 'const t={stdio:"inherit",detached:!0,shell:!0}',
        why: [
          'stdio  ignore -> inherit：让开发者工具 CLI 的输出直接透出来。',
          '       纯诊断用，不影响功能 —— 但排查时这行日志救过命，所以一并固化。',
          'shell:!0  新增：解开 Node 22 spawn .bat 的 EINVAL（本文件的根本原因）。',
        ].join('\n        '),
      },
      {
        from: 'o=P.default(o,[e,"--auto-port",A.default(s)])',
        to: "o=P.default(o,['\"'+e+'\"',\"--auto-port\",A.default(s)])",
        why: '给项目路径加引号 —— shell:true 之后命令要过 cmd.exe，路径含空格会被切开',
      },
      {
        from: 'const e=C.default.spawn(n,o,t)',
        to: "const e=C.default.spawn('\"'+n+'\"',o,t)",
        why: '给 CLI 路径加引号 —— 同上，开发者工具装在 "C:\\Program Files (x86)\\..." 或本项目所在的 "Have a try"，都带空格',
      },
    ],
  },
  {
    file: '@dcloudio/uni-automator/dist/index.js',
    edits: [
      {
        from: 'const l={cwd:t.cliPath,env:',
        to: 'const l={shell:!0,cwd:t.cliPath,env:',
        why: '同一类修复的另一处 spawn —— automator 自己还有一条启动路径也要 shell:true',
      },
    ],
  },
]

function main() {
  let changed = 0
  let already = 0

  for (const { file, edits } of PATCHES) {
    const abs = path.join(ROOT, 'node_modules', file)

    if (!fs.existsSync(abs)) {
      fail(`找不到 ${file}\n  先装依赖：npm ci`)
    }

    let src = fs.readFileSync(abs, 'utf8')
    const original = src
    const notes = []

    for (const { from, to, why } of edits) {
      const hasTo = src.includes(to)
      const hasFrom = src.includes(from)

      if (hasTo && !hasFrom) {
        already++
        notes.push(`  跳过（已经打过）: ${JSON.stringify(from.slice(0, 48))}…`)
        continue
      }

      if (!hasFrom) {
        // 既不是原样、也不是打好补丁的样子 —— 多半是依赖版本变了。
        // 这时候**必须停下来**让人看一眼，不能瞎猜一个位置继续改。
        fail(
          `${file} 里找不到这一处，而且它也不是已打补丁的样子：\n` +
            `  ${JSON.stringify(from.slice(0, 90))}…\n` +
            `  大概率是 @dcloudio/* 的版本变了（本脚本按 3.0.0-4080420251103001 写的），\n` +
            `  请对照 08-实测记录 §5.2 重新确认补丁点，别直接改这里的字符串。`
        )
      }

      const count = src.split(from).length - 1
      if (count !== 1) {
        fail(`${file} 里这一处出现了 ${count} 次，无法确定该改哪个：\n  ${JSON.stringify(from.slice(0, 90))}…`)
      }

      src = src.replace(from, to)
      changed++
      notes.push(`  已打: ${why}`)
    }

    if (!EXPECT_CHECK && src !== original) {
      fs.writeFileSync(abs, src)
    }

    console.log(`${notes.length ? '●' : '○'} ${file}`)
    notes.forEach((n) => console.log(n))
  }

  console.log('')
  if (changed === 0) {
    console.log(`✅ 4 处补丁都已经在了，无需改动。`)
  } else if (EXPECT_CHECK) {
    console.log(`⚠️  还有 ${changed} 处没打（--check 模式，未写入）。跑 npm run e2e:patch 补上。`)
    process.exit(1)
  } else {
    console.log(`✅ 本次新打 ${changed} 处补丁，共 ${already} 处原本就已存在。`)
  }
}

function fail(msg) {
  console.error(`\n❌ 补丁失败：\n${msg}\n`)
  process.exit(2)
}

main()
