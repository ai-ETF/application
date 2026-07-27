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
import { searchEtf as searchEtfApi } from '@/api/modules/market';

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
    loading.value = true;
    try {
      const res = await getWatchlist(true);
      followList.value = (res.items || []).map(toWatchlistItem);
      console.log('[WatchlistStore] 自选列表加载完成:', followList.value.length, '条');
    } catch (e) {
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
      return;
    }
    searching.value = true;
    try {
      const res = await searchEtfApi(kw, 15);
      searchResults.value = res.items || [];
      console.log('[WatchlistStore] 搜索完成:', searchResults.value.length, '条');
    } catch (e) {
      console.error('[WatchlistStore] 搜索失败:', e);
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }

  /** 清空搜索结果 */
  function clearSearch() {
    searchResults.value = [];
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
  async function addToFollow(fundCode: string): Promise<boolean> {
    try {
      const res = await addWatchlist(fundCode);
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

  return {
    // state
    activeTab,
    searchKeyword,
    followList,
    searchResults,
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
  };
});
