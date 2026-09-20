const URI_ESCAPE_RE = /%[0-9a-fA-F]{2}/;
// 中文等非 ASCII 字符被 encodeURIComponent 后，会留下连续的 UTF-8 百分号字节。
// 这个判断只用于识别“解码一层后仍然是编码串”，避免无条件重复解码合法的百分号。
const UTF8_ESCAPE_RE = /%(?:c[2-9a-f]|d[0-9a-f]|e[0-9a-f]|f[0-4])(?:%[0-9a-f]{2})+/i;

/**
 * 读取通过 URL 传递的参数。
 *
 * uni-app 在 H5 与各小程序端对 query 参数的自动解码行为可能不同：
 * 有的端会直接返回中文，有的端会保留 encodeURIComponent 结果。
 * 正常情况下只解码一层；若第一层解码后仍明确是 UTF-8 编码串（兼容部分端的重复编码），
 * 才再解码一层。非法编码则保留原值，避免页面崩溃。
 */
export function decodeRouteParam(value: unknown): string {
  let decoded = value == null ? '' : String(value);
  if (!decoded || !URI_ESCAPE_RE.test(decoded)) return decoded;

  try {
    const firstDecoded = decodeURIComponent(decoded);
    if (firstDecoded === decoded) return decoded;
    decoded = firstDecoded;
  } catch {
    return decoded;
  }

  // 仅对“第一层解码后仍是 UTF-8 百分号序列”的情况再解码一次。
  // 例如 %25E6%2598... -> %E6%98... -> 中文；
  // 例如 100%2520Growth -> 100%20Growth，会在这里停止并保留合法百分号。
  if (!UTF8_ESCAPE_RE.test(decoded)) return decoded;

  try {
    return decodeURIComponent(decoded);
  } catch {
    return decoded;
  }
}
