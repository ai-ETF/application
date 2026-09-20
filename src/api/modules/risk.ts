/**
 * ============================================
 * 风险测评 API
 * ============================================
 * 对接后端 /api/risk/* 接口
 * - 获取问卷
 * - 提交答案
 * - 查询画像
 */

import { get, post } from '@/utils/request';
import type {
  RiskQuestionnaire,
  RiskSubmitRequest,
  RiskSubmitResult,
  RiskProfileResult,
} from '@/api/types';

/**
 * 获取风险测评问卷
 * @returns 问卷数据（题目列表）
 */
export function getQuestionnaire() {
  console.log('[API] 请求风险测评问卷');
  return get<RiskQuestionnaire>('/api/risk/questionnaire').then(res => res.data);
}

/**
 * 提交风险测评答案
 * @param data - 提交请求体（问卷ID + 答案列表）
 * @returns 测评结果（投资者画像）
 */
export function submitAnswers(data: RiskSubmitRequest) {
  console.log('[API] 提交风险测评答案');
  return post<RiskSubmitResult>('/api/risk/submit', data).then(res => res.data);
}

/**
 * 查询投资者画像
 * @description 查询用户是否已完成测评及画像详情
 * @returns { has_profile, profile }
 */
export function getProfile() {
  console.log('[API] 查询投资者画像');
  return get<RiskProfileResult>('/api/risk/profile').then(res => res.data);
}
