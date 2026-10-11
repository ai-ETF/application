/**
 * ============================================
 * SSE 流式响应解析
 * ============================================
 * 从 pages/index/index.vue 里原样搬出来的两个纯函数：解析一行 SSE 数据、
 * 以及把分块到达的字节增量解成字符串。
 *
 * 搬家的理由：这两段是整条聊天链路里最容易出错、又最难验证的部分
 * （一个汉字被切成两半、上游返回半截 JSON），而它们本身不依赖任何
 * uni-app 运行时，放在这里可以直接用单元测试喂各种恶心输入。
 *
 * ⚠️ 逻辑与搬家前逐字一致，只加了 `export`。
 */

/**
 * 解析 SSE 行数据
 * @returns { type, content, chatId } 或 null
 */
export type ParsedSSELine =
  | { type: 'token'; content: string }
  | { type: 'done'; chatId: string }
  | { type: 'error'; message: string };

export function parseSSELine(line: string): ParsedSSELine | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;

  // data: {...} 格式
  if (trimmedLine.startsWith('data:')) {
    try {
      const jsonStr = trimmedLine.slice(5).trim();
      if (jsonStr === '[DONE]') return { type: 'done', chatId: '' };
      const data = JSON.parse(jsonStr);
      if (data.type === 'token' && data.content) {
        return { type: 'token', content: data.content };
      }
      if (data.type === 'done' && data.chat_id) {
        return { type: 'done', chatId: data.chat_id };
      }
      if (data.type === 'error') {
        return { type: 'error', message: data.message || 'AI 服务调用失败' };
      }
    } catch (error) {
      console.warn('[SSE] 解析 data 事件失败:', trimmedLine, error);
    }
    return null;
  }

  // 纯 JSON 格式（兼容)
  if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
    try {
      const data = JSON.parse(trimmedLine);
      if (data.type === 'token' && data.content) {
        return { type: 'token', content: data.content };
      }
      if (data.type === 'done' && data.chat_id) {
        return { type: 'done', chatId: data.chat_id };
      }
      if (data.type === 'error') {
        return { type: 'error', message: data.message || 'AI 服务调用失败' };
      }
    } catch (error) {
      console.warn('[SSE] 解析 JSON 事件失败:', trimmedLine, error);
    }
  }

  return null;
}

/**
 * 创建支持跨分块的 UTF-8 解码器。
 * 微信真机可能没有 TextDecoder，因此提供等价的增量解码降级。
 */
export function createUtf8StreamDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const nativeDecoder = new TextDecoder('utf-8');
    return {
      decode(buffer: ArrayBuffer) {
        return nativeDecoder.decode(new Uint8Array(buffer), { stream: true });
      },
      flush() {
        return nativeDecoder.decode();
      },
    };
  }

  let pendingBytes: number[] = [];

  function decodePending(flush: boolean) {
    let output = '';
    let index = 0;

    while (index < pendingBytes.length) {
      const first = pendingBytes[index];
      let size = 1;
      let codePoint = first;

      if ((first & 0xe0) === 0xc0) {
        size = 2;
        codePoint = first & 0x1f;
      } else if ((first & 0xf0) === 0xe0) {
        size = 3;
        codePoint = first & 0x0f;
      } else if ((first & 0xf8) === 0xf0) {
        size = 4;
        codePoint = first & 0x07;
      } else if (first >= 0x80) {
        output += '\ufffd';
        index += 1;
        continue;
      }

      if (index + size > pendingBytes.length) {
        if (!flush) break;
        output += '\ufffd';
        index += 1;
        continue;
      }

      let valid = true;
      for (let offset = 1; offset < size; offset += 1) {
        const next = pendingBytes[index + offset];
        if ((next & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
        codePoint = (codePoint << 6) | (next & 0x3f);
      }

      if (!valid) {
        output += '\ufffd';
        index += 1;
        continue;
      }

      if (codePoint <= 0xffff) {
        output += String.fromCharCode(codePoint);
      } else {
        const adjusted = codePoint - 0x10000;
        output += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
      }
      index += size;
    }

    pendingBytes = pendingBytes.slice(index);
    return output;
  }

  return {
    decode(buffer: ArrayBuffer) {
      pendingBytes.push(...Array.from(new Uint8Array(buffer)));
      return decodePending(false);
    },
    flush() {
      return decodePending(true);
    },
  };
}
