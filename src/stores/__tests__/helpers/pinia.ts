/**
 * 给 store 测试用的 pinia 装配。
 *
 * ⚠️ 为什么不能直接 `import { setActivePinia } from 'pinia'`：
 * 仓库里有一份手写的类型桩 [src/types/pinia.d.ts](../../../types/pinia.d.ts)，
 * 它把 `pinia` 这个模块**只**声明成 4 个导出（`defineStore` / `createPinia` /
 * `storeToRefs`，且 `defineStore` 返回 `any`），写第一版代码时用来顶替尚未安装的
 * pinia。现在 pinia 2.1.7 已经装上，这个桩**盖住了包自带的真实类型** ——
 * 于是 `setActivePinia` 在类型上不存在（运行时其实有），
 * 而且**所有 store 都是 `any`**，`vue-tsc` 对它们等于没检查。
 *
 * 这是本次跑单测时才发现的遗留问题，属于「只登记、不顺手改」的范畴：
 * 修它要动全前端的类型面，风险和工作量都不在本次任务里。
 * 这里用一次性的类型断言绕过去，让测试能写、`type-check` 仍然是干净的。
 */
import * as pinia from 'pinia';

interface RealPiniaApi {
  createPinia: () => unknown;
  setActivePinia: (instance: unknown) => void;
}

/** 装一个全新的 pinia 实例并设为当前活动实例。 */
export function activateFreshPinia(): void {
  const api = pinia as unknown as RealPiniaApi;
  api.setActivePinia(api.createPinia());
}
