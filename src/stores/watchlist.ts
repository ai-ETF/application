/**
 * ============================================
 * 自选列表状态管理 Store
 * ============================================
 * 管理关注列表和持仓数据
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { WatchlistItem, PortfolioData } from '@/types/models.d';

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

  /** 持仓数据（包含资产总览和持仓列表） */
  const portfolioData = ref<PortfolioData | null>(null);

  /** 是否正在加载 */
  const loading = ref<boolean>(false);

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
   * 设置关注列表数据
   * @param list - 关注列表
   */
  function setFollowList(list: WatchlistItem[]) {
    followList.value = list;
  }

  /**
   * 设置持仓数据
   * @param data - 持仓完整数据
   */
  function setPortfolioData(data: PortfolioData) {
    portfolioData.value = data;
  }

  /**
   * 从关注列表中移除
   * @param etfCode - ETF 代码
   */
  function removeFromFollow(etfCode: string) {
    followList.value = followList.value.filter(item => item.etfCode !== etfCode);
  }

  /**
   * 设置加载状态
   * @param isLoading - 是否加载中
   */
  function setLoading(isLoading: boolean) {
    loading.value = isLoading;
  }

  return {
    activeTab,
    searchKeyword,
    followList,
    portfolioData,
    loading,
    switchTab,
    setSearchKeyword,
    setFollowList,
    setPortfolioData,
    removeFromFollow,
    setLoading,
  };
});
