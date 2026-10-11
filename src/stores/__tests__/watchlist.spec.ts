/**
 * L1/L2 测试：自选列表 Store
 *
 * 这里看的是三件容易在真机上"偶发"、但很难复现的事情：
 *   1. 后端自选项 → 前端展示模型的补齐（市场标签、有没有行情）；
 *   2. 搜索的竞态：连着搜两次，先发的旧响应后回来，**不能**盖掉新结果；
 *   3. 用户切换保护：请求还在路上时用户退出了，回来的数据不能落到新状态里。
 *
 * 手段：把接口层整个换成假的（`vi.mock`），只跑 store 自己的逻辑；
 * 全局 `uni` 也换成本地假对象，所以不需要真机、不需要网络。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEYS, clearAuthSession } from '@/utils/auth';
import type { WatchlistItem } from '@/types/models.d';
import type { SearchResultRaw } from '@/api/types';
import { createFakeUni, makeJwt, type FakeUni } from '@/utils/__tests__/helpers/fake-uni';
import { activateFreshPinia } from './helpers/pinia';

// 接口层全部换成假的。用 vi.hoisted 是因为 vi.mock 会被提到文件顶部执行，
// 那时普通 const 还没初始化。
const api = vi.hoisted(() => ({
  getWatchlist: vi.fn(),
  addWatchlist: vi.fn(),
  removeWatchlist: vi.fn(),
  clearWatchlist: vi.fn(),
  searchEtf: vi.fn(),
  getEtfDetail: vi.fn(),
}));

vi.mock('@/api/modules/watchlist', () => ({
  getWatchlist: api.getWatchlist,
  addWatchlist: api.addWatchlist,
  removeWatchlist: api.removeWatchlist,
  clearWatchlist: api.clearWatchlist,
}));

vi.mock('@/api/modules/market', () => ({
  searchEtf: api.searchEtf,
  getEtfDetail: api.getEtfDetail,
}));

import { useWatchlistStore } from '@/stores/watchlist';

const HOUR = 60 * 60 * 1000;
const USER = { id: 'user-1', username: 'lpqst', displayName: 'lpqst' };

let fake: FakeUni;

beforeEach(() => {
  // reset 而不是 clear：连 mockImplementationOnce 的队列一起清掉，
  // 免得某条用例没消费完的实现漏给下一条
  vi.resetAllMocks();
  activateFreshPinia();
  fake = createFakeUni();
  fake.install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 写一份有效的本地登录态 —— store 靠它判断「当前是谁」。 */
function seedSession() {
  const now = Date.now();
  fake.storage.set(AUTH_STORAGE_KEYS.token, makeJwt({ sub: USER.id, iat: now / 1000, exp: (now + 10 * HOUR) / 1000 }));
  fake.storage.set(AUTH_STORAGE_KEYS.user, JSON.stringify(USER));
  fake.storage.set(AUTH_STORAGE_KEYS.loginTime, now);
  fake.storage.set(AUTH_STORAGE_KEYS.expireTime, now + HOUR);
}

describe('后端自选项 → 前端展示模型', () => {
  it('按代码前缀推断市场标签，5/6 沪市、0/1 深市、其余留空', async () => {
    seedSession();
    api.getWatchlist.mockResolvedValue({
      items: [
        { fund_code: '510300', fund_name: '沪深300ETF', price: 4.2, change_pct: 1.1 },
        { fund_code: '159915', fund_name: '创业板ETF', price: 2.1, change_pct: -0.5 },
        { fund_code: '110020', fund_name: '场外基金', price: 1.5, change_pct: 0.2 },
        { fund_code: 'HK001', fund_name: '怪代码' },
      ],
    });
    const store = useWatchlistStore();

    await store.fetchFollowList();

    expect(store.followList.map((item: WatchlistItem) => item.market)).toEqual(['沪', '深', '深', '']);
  });

  it('行情缺失时 hasQuote 为 false，价格回落成 0 而不是 NaN', async () => {
    seedSession();
    api.getWatchlist.mockResolvedValue({
      items: [
        { fund_code: '510300', fund_name: '有行情', price: 4.2, change_pct: 1.1 },
        { fund_code: '159915', fund_name: '没行情', price: null, change_pct: null },
        { fund_code: '110020', fund_name: '只有净值', price: 1.5, change_pct: null },
      ],
    });
    const store = useWatchlistStore();

    await store.fetchFollowList();

    expect(store.followList.map((item: WatchlistItem) => item.hasQuote)).toEqual([true, false, true]);
    expect(store.followList.map((item: WatchlistItem) => item.latestPrice)).toEqual([4.2, 0, 1.5]);
    expect(store.followList.every((item: WatchlistItem) => Number.isFinite(item.latestPrice))).toBe(true);
  });

  it('请求失败时弹提示，且不留下半截数据', async () => {
    seedSession();
    api.getWatchlist.mockRejectedValue(new Error('网络炸了'));
    const store = useWatchlistStore();

    await store.fetchFollowList();

    expect(fake.toasts).toEqual(['加载自选失败，请稍后重试']);
    expect(store.followList).toEqual([]);
    expect(store.loading).toBe(false);
  });
});

describe('没登录时不发请求', () => {
  it('本地没有登录态就直接清空，不发请求', async () => {
    const store = useWatchlistStore();
    store.followList = [
      { etfCode: '510300', etfName: 'x', market: '沪', latestPrice: 1, changePercent: 0, hasQuote: true, ytdChange: 0 },
    ];

    await store.fetchFollowList();

    expect(api.getWatchlist).not.toHaveBeenCalled();
    expect(store.followList).toEqual([]);
  });
});

describe('用户切换保护', () => {
  it('请求还在路上时用户退出，回来的数据不能落到新状态里', async () => {
    seedSession();
    const store = useWatchlistStore();
    let releaseRequest!: (value: unknown) => void;
    api.getWatchlist.mockImplementation(
      () => new Promise((resolve) => { releaseRequest = resolve; }),
    );

    const pending = store.fetchFollowList();
    // 请求发出之后、回来之前，用户退出了
    clearAuthSession();
    releaseRequest({ items: [{ fund_code: '510300', fund_name: '借来的数据' }] });
    await pending;

    // 上一位用户的自选不能出现在这里
    expect(store.followList).toEqual([]);
  });
});

describe('搜索竞态', () => {
  it('连着搜两次，先发出的旧响应后回来时被丢弃', async () => {
    seedSession();
    const store = useWatchlistStore();
    let releaseOldSearch!: (value: unknown) => void;
    api.searchEtf
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOldSearch = resolve; }))
      .mockImplementationOnce(() => Promise.resolve({ items: [{ code: '510300', name: '新结果' }] }));

    const oldSearch = store.searchEtf('旧关键词');
    const newSearch = store.searchEtf('新关键词');
    await newSearch;

    // 旧请求现在才回来，必须被丢掉
    releaseOldSearch({ items: [{ code: '000001', name: '旧结果' }] });
    await oldSearch;

    expect(store.searchResults.map((item: SearchResultRaw) => item.code)).toEqual(['510300']);
    expect(store.searching).toBe(false);
  });

  it('关键词为空时清空结果，不发请求', async () => {
    seedSession();
    const store = useWatchlistStore();

    await store.searchEtf('   ');

    expect(api.searchEtf).not.toHaveBeenCalled();
    expect(store.searchResults).toEqual([]);
    expect(store.searchError).toBe('');
  });

  it('搜索主接口挂了、代码详情也查不到时，才报「无法连接」', async () => {
    seedSession();
    api.searchEtf.mockRejectedValue(new Error('挂了'));
    api.getEtfDetail.mockRejectedValue(new Error('也挂了'));
    const store = useWatchlistStore();

    await store.searchEtf('110020');

    expect(store.searchError).toBe('搜索服务暂时无法连接，请稍后重试');
    expect(store.searchResults).toEqual([]);
  });

  it('搜索主接口挂了但代码详情查得到时，不报网络错误', async () => {
    seedSession();
    api.searchEtf.mockRejectedValue(new Error('挂了'));
    api.getEtfDetail.mockResolvedValue({
      code: '110020',
      short_name: '某场外基金',
      nav_history: [{ date: '2026-10-10', nav: 1.234 }],
    });
    const store = useWatchlistStore();

    await store.searchEtf('110020');

    expect(store.searchError).toBe('');
    expect(store.searchResults).toHaveLength(1);
    expect(store.searchResults[0]).toMatchObject({ code: '110020', name: '某场外基金', data_source: 'fund_detail' });
  });
});
