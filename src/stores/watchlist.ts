/**
 * ============================================
 * 自选列表状态管理 Store
 * ============================================
 * 管理关注列表（接入后端 /api/watchlist）与持仓数据
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { WatchlistItem, PortfolioData } from '@/types/models.d';
import type { WatchlistItemRaw, SearchResultRaw } from '@/api/types';
import {
  getWatchlist,
  addWatchlist,
  removeWatchlist,
  clearWatchlist,
} from '@/api/modules/watchlist';
import { getEtfDetail, searchEtf as searchEtfApi } from '@/api/modules/market';
import { getCurrentUserId } from '@/utils/auth';
import { TRADEABLE_FUND_CODES } from '@/config/portfolio';

// ==================== 适配层：后端字段 → 前端模型 ====================

/**
 * 由基金代码推断市场标签
 * @description 5/6 开头为沪市，0/1 开头为深市
 */
function deriveMarket(code: string): string {
  const c = code.trim();
  if (/^[56]/.test(c)) return '沪';
  if (/^[01]/.test(c)) return '深';
  return '';
}

/**
 * 后端自选项 → 前端展示模型
 * @description 后端自选列表不返回 YTD 与 market，需本地补齐
 */
function toWatchlistItem(raw: WatchlistItemRaw): WatchlistItem {
  return {
    etfCode: raw.fund_code,
    etfName: raw.fund_name,
    market: deriveMarket(raw.fund_code),
    latestPrice: raw.price ?? 0,
    changePercent: raw.change_pct ?? 0,
    hasQuote: raw.price != null || raw.change_pct != null,
    // 后端自选列表不返回 YTD，置 0；页面改用 changePercent 展示涨跌幅
    ytdChange: 0,
  };
}

/**
 * 自选列表 Store
 * @description 管理关注列表和持仓列表数据
 */
export const useWatchlistStore = defineStore('watchlist', () => {
  // ==================== State ====================

  /** 当前激活的 Tab：follow(关注) 或 position(持仓) */
  const activeTab = ref<'follow' | 'position'>('follow');

  /** 搜索关键词 */
  const searchKeyword = ref<string>('');

  /** 关注列表数据 */
  const followList = ref<WatchlistItem[]>([]);

  /** 搜索结果（用于添加自选） */
  const searchResults = ref<SearchResultRaw[]>([]);

  /** 持仓数据（包含资产总览和持仓列表） */
  const portfolioData = ref<PortfolioData | null>(null);

  /** 是否正在加载自选列表 */
  const loading = ref<boolean>(false);

  /** 是否正在搜索 */
  const searching = ref<boolean>(false);

  /** 搜索请求失败信息；与“请求成功但无结果”区分。 */
  const searchError = ref<string>('');
  let searchRequestId = 0;

  // ==================== Getters ====================

  /** 已关注代码集合，用于搜索结果判断是否已添加 */
  const followCodeSet = computed(() => new Set(followList.value.map(i => i.etfCode)));

  // ==================== Actions ====================

  /**
   * 切换 Tab
   * @param tab - 目标 Tab 类型
   */
  function switchTab(tab: 'follow' | 'position') {
    activeTab.value = tab;
    console.log(`[WatchlistStore] 切换 Tab 至: ${tab}`);
  }

  /**
   * 设置搜索关键词
   * @param keyword - 搜索关键词
   */
  function setSearchKeyword(keyword: string) {
    searchKeyword.value = keyword;
  }

  /**
   * 设置持仓数据
   * @param data - 持仓完整数据
   */
  function setPortfolioData(data: PortfolioData) {
    portfolioData.value = data;
  }

  /**
   * 拉取自选列表（含实时行情）
   */
  async function fetchFollowList() {
    const requestedUserId = getCurrentUserId();
    if (!requestedUserId) {
      followList.value = [];
      return;
    }
    loading.value = true;
    try {
      const res = await getWatchlist(true);
      // 退出或切换用户期间，旧请求返回的数据不能回写到新用户状态。
      if (getCurrentUserId() !== requestedUserId) return;
      followList.value = (res.items || []).map(toWatchlistItem);
      console.log('[WatchlistStore] 自选列表加载完成:', followList.value.length, '条');
    } catch (e) {
      if (getCurrentUserId() !== requestedUserId) return;
      console.error('[WatchlistStore] 加载自选列表失败:', e);
      uni.showToast({ title: '加载自选失败，请稍后重试', icon: 'none' });
    } finally {
      loading.value = false;
    }
  }

  /**
   * 搜索 ETF（用于添加自选）
   * @param keyword - 搜索关键词
   */
  async function searchEtf(keyword: string) {
    const kw = keyword.trim();
    if (!kw) {
      searchResults.value = [];
      searchError.value = '';
      return;
    }
    const requestId = ++searchRequestId;
    searching.value = true;
    searchError.value = '';
    searchResults.value = [];
    try {
      const res = await searchEtfApi(kw, 15);
      if (requestId !== searchRequestId) return;
      searchResults.value = (res.items || []).map(item => ({
        ...item,
        tradeable: TRADEABLE_FUND_CODES.has(item.code),
        data_source: 'market_quote' as const,
      }));

      // 行情搜索只覆盖场内 ETF。对六位代码再调用现有详情接口，
      // 让场外基金也能通过真实后端数据进入搜索结果；不生成虚构价格。
      if (searchResults.value.length === 0 && /^\d{6}$/.test(kw)) {
        try {
          const detail = await getEtfDetail(kw);
          if (requestId !== searchRequestId) return;
          const latestNav = [...(detail.nav_history || [])]
            .reverse()
            .find(item => item.nav != null);
          // 后端场外详情可能返回展示用代码（如“110020（前端）”）。
          // 搜索结果后续会把 code 作为详情接口路径，必须保留用户输入的六位代码。
          const code = /^\d{6}$/.test(detail.code || '') ? detail.code! : kw;
          const name = detail.short_name || detail.full_name;
          if (name) {
            searchResults.value = [{
              code,
              name,
              fund_type: detail.fund_type || null,
              price: detail.realtime?.price,
              change_pct: detail.realtime?.change_pct,
              change: detail.realtime?.change,
              nav: latestNav?.nav ?? null,
              nav_date: latestNav?.date ?? null,
              tradeable: TRADEABLE_FUND_CODES.has(code),
              data_source: 'fund_detail',
            }];
          }
        } catch (fallbackError) {
          // 主搜索成功但代码不存在时仍应显示“无结果”，不误报为网络故障。
          console.info('[WatchlistStore] 代码详情回退无结果:', fallbackError);
        }
      }
      console.log('[WatchlistStore] 搜索完成:', searchResults.value.length, '条');
    } catch (e) {
      if (requestId !== searchRequestId) return;
      console.error('[WatchlistStore] 搜索失败:', e);
      searchResults.value = [];
      // 主搜索失败时仍尝试按代码查详情；只有两个接口都失败才显示网络错误。
      if (/^\d{6}$/.test(kw)) {
        try {
          const detail = await getEtfDetail(kw);
          if (requestId !== searchRequestId) return;
          const latestNav = [...(detail.nav_history || [])].reverse().find(item => item.nav != null);
          // 后端场外详情可能返回展示用代码（如“110020（前端）”）。
          // 搜索结果后续会把 code 作为详情接口路径，必须保留用户输入的六位代码。
          const code = /^\d{6}$/.test(detail.code || '') ? detail.code! : kw;
          const name = detail.short_name || detail.full_name;
          if (name) {
            searchResults.value = [{
              code,
              name,
              fund_type: detail.fund_type || null,
              price: detail.realtime?.price,
              change_pct: detail.realtime?.change_pct,
              change: detail.realtime?.change,
              nav: latestNav?.nav ?? null,
              nav_date: latestNav?.date ?? null,
              tradeable: TRADEABLE_FUND_CODES.has(code),
              data_source: 'fund_detail',
            }];
            return;
          }
        } catch (fallbackError) {
          console.info('[WatchlistStore] 搜索失败后的代码回退失败:', fallbackError);
        }
      }
      searchError.value = '搜索服务暂时无法连接，请稍后重试';
    } finally {
      if (requestId === searchRequestId) searching.value = false;
    }
  }

  /** 清空搜索结果 */
  function clearSearch() {
    searchRequestId += 1;
    searchResults.value = [];
    searchError.value = '';
  }

  /**
   * 判断是否已关注
   * @param fundCode - 基金代码
   */
  function isFollowed(fundCode: string): boolean {
    return followCodeSet.value.has(fundCode);
  }

  /**
   * 添加自选
   * @param fundCode - 基金代码
   * @returns 是否添加成功
   */
  async function addToFollow(fundCode: string, fundName?: string): Promise<boolean> {
    try {
      const res = await addWatchlist(fundCode, fundName);
      if (res.success) {
        console.log('[WatchlistStore] 添加自选成功:', fundCode);
        // 刷新列表以拿到后端回填的名称与行情
        await fetchFollowList();
        return true;
      }
      uni.showToast({ title: res.message || '添加失败', icon: 'none' });
      return false;
    } catch (e) {
      console.error('[WatchlistStore] 添加自选失败:', e);
      uni.showToast({ title: '添加失败，请稍后重试', icon: 'none' });
      return false;
    }
  }

  /**
   * 移除自选
   * @param etfCode - 基金代码
   * @returns 是否移除成功
   */
  async function removeFromFollow(etfCode: string): Promise<boolean> {
    try {
      const res = await removeWatchlist(etfCode);
      if (res.success) {
        // 本地直接过滤，避免再请求一次行情
        followList.value = followList.value.filter(item => item.etfCode !== etfCode);
        console.log('[WatchlistStore] 移除自选成功:', etfCode);
        return true;
      }
      uni.showToast({ title: res.message || '移除失败', icon: 'none' });
      return false;
    } catch (e) {
      console.error('[WatchlistStore] 移除自选失败:', e);
      uni.showToast({ title: '移除失败，请稍后重试', icon: 'none' });
      return false;
    }
  }

  /**
   * 清空自选
   */
  async function clearFollow() {
    try {
      await clearWatchlist();
      followList.value = [];
      console.log('[WatchlistStore] 已清空自选');
    } catch (e) {
      console.error('[WatchlistStore] 清空自选失败:', e);
    }
  }

  /** 用户切换或退出时只清空前端内存，不改动服务端自选数据。 */
  function resetForAuthChange() {
    activeTab.value = 'follow';
    searchKeyword.value = '';
    followList.value = [];
    searchResults.value = [];
    portfolioData.value = null;
    loading.value = false;
    searching.value = false;
    searchError.value = '';
    console.log('[WatchlistStore] 已清空用户数据内存');
  }

  return {
    // state
    activeTab,
    searchKeyword,
    followList,
    searchResults,
    searchError,
    portfolioData,
    loading,
    searching,
    // getters
    followCodeSet,
    // actions
    switchTab,
    setSearchKeyword,
    setPortfolioData,
    fetchFollowList,
    searchEtf,
    clearSearch,
    isFollowed,
    addToFollow,
    removeFromFollow,
    clearFollow,
    resetForAuthChange,
  };
});
